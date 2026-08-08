import type { DispatchKey, JobDefinition, JobLogger, JobRunSummary, ScheduledJobStore, Scheduler } from './types.js';

const defaultLogger: JobLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

type CreateSchedulerOptions = {
  store: ScheduledJobStore;
  jobs: JobDefinition[];
  tickMs?: number;
  logger?: JobLogger;
};

function timeoutSignal(ms: number) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function assertUsableSchedule(jobs: JobDefinition[], tickMs: number) {
  for (const job of jobs) {
    if (!Number.isInteger(job.schedule.everySeconds) || job.schedule.everySeconds <= 0) {
      throw new Error(`Invalid schedule for ${job.name}`);
    }
    if (job.minimumViableWindowSeconds * 1000 < tickMs * 3) {
      throw new Error(`Job ${job.name} minimum viable window is narrower than three ticks`);
    }
    const timeoutSeconds = job.timeoutSeconds ?? 60;
    const staleSeconds = job.dispatchReclaimStaleAfterSeconds ?? 300;
    if (staleSeconds <= timeoutSeconds) {
      throw new Error(`Job ${job.name} dispatch reclaim window must exceed job timeout`);
    }
    if (job.dispatchMaxAttempts !== undefined && (!Number.isInteger(job.dispatchMaxAttempts) || job.dispatchMaxAttempts <= 0)) {
      throw new Error(`Job ${job.name} dispatch max attempts must be a positive integer`);
    }
  }
}

function duration(startedAt: Date, finishedAt: Date) {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

class JobTimeoutError extends Error {
  constructor(jobName: string) {
    super(`Job ${jobName} exceeded its timeout`);
    this.name = 'JobTimeoutError';
  }
}

export function createScheduler(opts: CreateSchedulerOptions): Scheduler {
  const tickMs = opts.tickMs ?? 60_000;
  const logger = opts.logger ?? defaultLogger;
  const jobs = new Map(opts.jobs.map((job) => [job.name, job]));
  assertUsableSchedule(opts.jobs, tickMs);

  let timer: NodeJS.Timeout | null = null;
  let activeTick: Promise<JobRunSummary[]> | null = null;

  async function safelyComplete(
    name: string,
    summary: JobRunSummary,
    options: { releaseLease: boolean; maxConsecutiveFailures: number },
  ) {
    try {
      await opts.store.completeJob(name, summary, options);
    } catch (error) {
      logger.error('Scheduled job completion update failed', { jobName: name, error: errorMessage(error) });
    }
  }

  async function executeJob(
    job: JobDefinition,
    now: Date,
    mode: 'claimed' | 'manual',
    claimedDueAt?: Date,
  ): Promise<JobRunSummary> {
    const startedAt = new Date();
    const timeoutSeconds = job.timeoutSeconds ?? 60;
    const signal = timeoutSignal(timeoutSeconds * 1000);
    const boundStore = {
      claimDispatch(jobName: string, key: DispatchKey) {
        return opts.store.claimDispatch(jobName, key, {
          reclaimStaleAfterSeconds: job.dispatchReclaimStaleAfterSeconds ?? 300,
          maxAttempts: job.dispatchMaxAttempts ?? 3,
        });
      },
      markDispatched: opts.store.markDispatched.bind(opts.store),
      failDispatch: opts.store.failDispatch.bind(opts.store),
    };

    try {
      const handlerResult = await Promise.race([
        job.handler({ now, signal, logger, store: boundStore }),
        new Promise<never>((_, reject) => {
          const timeout = setTimeout(() => reject(new JobTimeoutError(job.name)), timeoutSeconds * 1000);
          timeout.unref?.();
        }),
      ]);
      const finishedAt = new Date();
      const summary: JobRunSummary = {
        jobName: job.name,
        status: 'SUCCESS',
        startedAt,
        finishedAt,
        durationMs: duration(startedAt, finishedAt),
        claimedDueAt,
        ...(handlerResult || {}),
      };
      await safelyComplete(job.name, summary, { releaseLease: mode === 'claimed', maxConsecutiveFailures: job.maxConsecutiveFailures ?? 3 });
      return summary;
    } catch (error) {
      const finishedAt = new Date();
      const message = errorMessage(error);
      const timedOut = error instanceof JobTimeoutError;
      const summary: JobRunSummary = {
        jobName: job.name,
        status: timedOut ? 'TIMEOUT' : 'FAILED',
        startedAt,
        finishedAt,
        durationMs: duration(startedAt, finishedAt),
        claimedDueAt,
        error: message,
      };
      await safelyComplete(job.name, summary, { releaseLease: mode === 'claimed' && !timedOut, maxConsecutiveFailures: job.maxConsecutiveFailures ?? 3 });
      return summary;
    }
  }

  async function runDueJobsOnce(now = new Date()) {
    const settled = await Promise.allSettled(opts.jobs.map(async (job) => {
      const claim = await opts.store.claimDueJob(
        job.name,
        job.timeoutSeconds ?? 60,
        job.maxConsecutiveFailures ?? 3,
        job.circuitCooldownSeconds ?? 300,
      );
      if (!claim) return null;
      return executeJob(job, now, 'claimed', claim.claimedDueAt);
    }));
    return settled.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value ? [result.value] : [];
      const job = opts.jobs[index];
      logger.error('Scheduled job claim failed', { jobName: job.name, error: errorMessage(result.reason) });
      return [{
        jobName: job.name,
        status: 'FAILED' as const,
        startedAt: now,
        finishedAt: new Date(),
        durationMs: 0,
        error: errorMessage(result.reason),
      }];
    });
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        if (activeTick) return;
        activeTick = runDueJobsOnce()
          .catch((error) => {
            logger.error('Scheduled job tick failed', { error: errorMessage(error) });
            return [];
          })
          .finally(() => {
            activeTick = null;
          });
      }, tickMs);
      timer.unref?.();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (activeTick) await activeTick;
    },
    runDueJobsOnce,
    async runJobNow(name: string, now = new Date()) {
      const job = jobs.get(name);
      if (!job) throw new Error(`Unknown job ${name}`);
      return executeJob(job, now, 'manual');
    },
  };
}
