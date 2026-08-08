export type RunStatus = 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'SKIPPED_DUPLICATE';

export type DispatchStatus = 'PENDING' | 'SENT' | 'FAILED' | 'ABANDONED';

export type DispatchKey = {
  dedupKey: string;
  tenantId?: string | null;
  subjectId?: string | null;
  occurrenceAt?: Date | null;
  expiresAt?: Date | null;
};

export type DispatchClaimOptions = {
  reclaimStaleAfterSeconds: number;
  maxAttempts: number;
};

export type ClaimResult = {
  name: string;
  claimedDueAt: Date;
  nextRunAt: Date;
  consecutiveFailures?: number;
};

export type JobRunSummary = {
  jobName: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  claimedDueAt?: Date;
  processed?: number;
  skipped?: number;
  error?: string;
};

export interface ScheduledJobStore {
  claimDueJob(name: string, leaseSeconds: number, maxConsecutiveFailures: number, cooldownSeconds: number): Promise<ClaimResult | null>;
  completeJob(name: string, result: { status: RunStatus; error?: string; durationMs: number }, options?: { releaseLease?: boolean; maxConsecutiveFailures?: number }): Promise<void>;
  claimDispatch(jobName: string, key: DispatchKey, options?: DispatchClaimOptions): Promise<boolean>;
  markDispatched(jobName: string, dedupKey: string): Promise<void>;
  failDispatch(jobName: string, dedupKey: string, error: string): Promise<void>;
  pruneDispatches(before: Date, batchSize: number): Promise<number>;
}

export interface JobLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface JobContext {
  now: Date;
  signal: AbortSignal;
  logger: JobLogger;
  store: {
    claimDispatch(jobName: string, key: DispatchKey): Promise<boolean>;
    markDispatched(jobName: string, dedupKey: string): Promise<void>;
    failDispatch(jobName: string, dedupKey: string, error: string): Promise<void>;
  };
}

export interface JobDefinition {
  name: string;
  schedule: { everySeconds: number };
  timeoutSeconds?: number;
  minimumViableWindowSeconds: number;
  maxConsecutiveFailures?: number;
  circuitCooldownSeconds?: number;
  dispatchReclaimStaleAfterSeconds?: number;
  dispatchMaxAttempts?: number;
  handler(ctx: JobContext): Promise<Partial<Omit<JobRunSummary, 'jobName' | 'status' | 'startedAt' | 'finishedAt' | 'durationMs'>> | void>;
}

export interface Scheduler {
  start(): void;
  stop(): Promise<void>;
  runDueJobsOnce(now?: Date): Promise<JobRunSummary[]>;
  runJobNow(name: string, now?: Date): Promise<JobRunSummary>;
}
