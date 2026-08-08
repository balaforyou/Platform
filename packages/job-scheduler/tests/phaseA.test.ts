import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@badminton/database';
import {
  createScheduler,
  createSqlScheduledJobStore,
  CLAIM_DUE_JOB_SQL,
  type ClaimResult,
  type DispatchKey,
  type JobDefinition,
  type JobRunSummary,
  type ScheduledJobStore,
  type SqlExecutor,
} from '../src/index.js';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function repoRoot() {
  return path.resolve(process.cwd(), '..', '..');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class PrismaSqlExecutor implements SqlExecutor {
  constructor(private readonly prisma: PrismaClient) {}

  async query<T>(sql: string, params: unknown[] = []) {
    return this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
  }

  async execute(sql: string, params: unknown[] = []) {
    return this.prisma.$executeRawUnsafe(sql, ...params);
  }
}

async function resetRows(prisma: PrismaClient, jobNames: string[]) {
  await prisma.$executeRaw`
    DELETE FROM "ScheduledJobDispatch"
    WHERE "jobName" IN (${Prisma.join(jobNames)})
  `;
  await prisma.$executeRaw`
    DELETE FROM "ScheduledJob"
    WHERE "name" IN (${Prisma.join(jobNames)})
  `;
}

function createPgStore(prisma: PrismaClient) {
  return createSqlScheduledJobStore(new PrismaSqlExecutor(prisma));
}

async function realEmittedSql() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe(`EXPLAIN ${CLAIM_DUE_JOB_SQL}`, 'f044-explain', 30, 3, 300);
    const store = createPgStore(prisma);
    await resetRows(prisma, ['f044-emitted-sql']);
    await prisma.$executeRaw`
      INSERT INTO "ScheduledJob" ("name", "intervalSeconds", "timeoutSeconds", "nextRunAt", "updatedAt")
      VALUES ('f044-emitted-sql', 60, 30, now() - interval '1 second', now())
    `;
    const claim = await store.claimDueJob('f044-emitted-sql', 30, 3, 300);
    const evidence = {
      explainParsed: true,
      claimed: !!claim,
      claim,
      sql: CLAIM_DUE_JOB_SQL,
    };
    console.log('F044_PHASE_A_REAL_EMITTED_SQL', JSON.stringify(evidence));
    assert(!!claim, 'real emitted SQL must claim the seeded row');
  } finally {
    await resetRows(prisma, ['f044-emitted-sql']);
    await prisma.$disconnect();
  }
}

async function realClaimConcurrency() {
  const jobName = 'f044-real-claim';
  const futureJobName = 'f044-future-claim';
  const setup = new PrismaClient();
  const clientA = new PrismaClient();
  const clientB = new PrismaClient();
  try {
    await resetRows(setup, [jobName, futureJobName]);
    await setup.$executeRaw`
      INSERT INTO "ScheduledJob" ("name", "intervalSeconds", "timeoutSeconds", "nextRunAt", "updatedAt")
      VALUES (${jobName}, 60, 30, now() - interval '1 second', now())
    `;
    await setup.$executeRaw`
      INSERT INTO "ScheduledJob" ("name", "intervalSeconds", "timeoutSeconds", "nextRunAt", "updatedAt")
      VALUES (${futureJobName}, 60, 30, now() + interval '5 minutes', now())
    `;
    const storeA = createPgStore(clientA);
    const storeB = createPgStore(clientB);
    const [first, second] = await Promise.all([
      storeA.claimDueJob(jobName, 30, 3, 300),
      storeB.claimDueJob(jobName, 30, 3, 300),
    ]);
    const futureClaim = await storeA.claimDueJob(futureJobName, 30, 3, 300);
    const claimed = [first, second].filter(Boolean) as ClaimResult[];
    const dbRows = await setup.$queryRaw<Array<{ name: string; lockedUntil: Date | null; nextRunAt: Date; lastRunAt: Date | null }>>`
      SELECT "name", "lockedUntil", "nextRunAt", "lastRunAt"
      FROM "ScheduledJob"
      WHERE "name" IN (${Prisma.join([jobName, futureJobName])})
      ORDER BY "name"
    `;
    const evidence = {
      callers: 2,
      claimedCount: claimed.length,
      claims: claimed,
      futureClaim,
      dbRows,
    };
    console.log('F044_PHASE_A_REAL_CLAIM_CONCURRENCY', JSON.stringify(evidence));
    assert(claimed.length === 1, 'exactly one real Postgres connection must claim the due row');
    assert(futureClaim === null, 'not-due future row must not be claimed');
    assert(dbRows.find((row) => row.name === jobName)?.lockedUntil, 'winning claim must set a real lease');
  } finally {
    await resetRows(setup, [jobName, futureJobName]);
    await Promise.all([setup.$disconnect(), clientA.$disconnect(), clientB.$disconnect()]);
  }
}

function postgresUniqueCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  const direct = (error as { code?: string }).code;
  const meta = (error as { meta?: { code?: string } }).meta?.code;
  return meta || direct;
}

async function realDedupConstraint() {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  const cleanup = new PrismaClient();
  const jobName = 'f044-real-dedup';
  const dedupKey = 'same-occurrence';

  try {
    await resetRows(cleanup, [jobName]);
    const storeA = createPgStore(prismaA);
    const storeB = createPgStore(prismaB);
    const results = await Promise.allSettled([
      storeA.claimDispatch(jobName, { dedupKey }),
      storeB.claimDispatch(jobName, { dedupKey }),
    ]);
    const claimed = results.filter((result): result is PromiseFulfilledResult<boolean> => result.status === 'fulfilled' && result.value);
    const duplicates = results.filter((result): result is PromiseFulfilledResult<boolean> => result.status === 'fulfilled' && !result.value);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    const rows = await cleanup.$queryRaw<Array<{ jobName: string; dedupKey: string; status: string }>>`
      SELECT "jobName", "dedupKey", "status"
      FROM "ScheduledJobDispatch"
      WHERE "jobName" = ${jobName}
    `;
    const evidence = {
      claimed: claimed.length,
      duplicates: duplicates.length,
      rejected: rejected.length,
      rejectedCodes: rejected.map((result) => postgresUniqueCode(result.reason)),
      rows,
    };
    console.log('F044_PHASE_A_PRODUCTION_DEDUP_CLAIM', JSON.stringify(evidence));
    assert(claimed.length === 1, 'exactly one production claimDispatch call must claim the dedup key');
    assert(duplicates.length === 1, 'exactly one production claimDispatch call must be denied by the retry predicate');
    assert(rejected.length === 0, 'production claimDispatch must deny duplicates without throwing');
    assert(rows.length === 1, 'unique constraint must leave exactly one ledger row');
  } finally {
    await resetRows(cleanup, [jobName]);
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect(), cleanup.$disconnect()]);
  }
}

async function rawUniqueCodeEvidence() {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  const cleanup = new PrismaClient();
  const jobName = 'f044-real-raw-23505';
  const dedupKey = 'same-occurrence';
  const insert = (client: PrismaClient, id: string) => client.$executeRaw`
    INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "dedupKey", "status", "updatedAt")
    VALUES (${id}, ${jobName}, ${dedupKey}, 'PENDING', now())
  `;

  try {
    await resetRows(cleanup, [jobName]);
    const results = await Promise.allSettled([
      insert(prismaA, 'f044-real-raw-23505-a'),
      insert(prismaB, 'f044-real-raw-23505-b'),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    const rows = await cleanup.$queryRaw<Array<{ jobName: string; dedupKey: string; status: string }>>`
      SELECT "jobName", "dedupKey", "status"
      FROM "ScheduledJobDispatch"
      WHERE "jobName" = ${jobName}
    `;
    const evidence = {
      fulfilled: fulfilled.length,
      rejected: rejected.length,
      rejectedCodes: rejected.map((result) => postgresUniqueCode(result.reason)),
      rows,
    };
    console.log('F044_PHASE_A_RAW_UNIQUE_23505', JSON.stringify(evidence));
    assert(fulfilled.length === 1, 'one raw insert must succeed against the real unique index');
    assert(rejected.length === 1, 'one raw insert must be rejected by the real unique index');
    assert(postgresUniqueCode(rejected[0]?.reason) === '23505', 'raw duplicate insert must expose Postgres 23505');
    assert(rows.length === 1, 'raw unique proof must leave one ledger row');
  } finally {
    await resetRows(cleanup, [jobName]);
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect(), cleanup.$disconnect()]);
  }
}

async function retryByStatusRaces() {
  const setup = new PrismaClient();
  const staleA = new PrismaClient();
  const staleB = new PrismaClient();
  const liveA = new PrismaClient();
  const liveB = new PrismaClient();
  const staleJobName = 'f044-stale-retry-race';
  const liveJobName = 'f044-live-pending-race';
  const exhaustedJobName = 'f044-exhausted-retry';
  const dedupKey = 'same-occurrence';

  try {
    await resetRows(setup, [staleJobName, liveJobName, exhaustedJobName]);
    await setup.$executeRaw`
      INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "dedupKey", "status", "attempts", "updatedAt")
      VALUES ('f044-stale-retry-row', ${staleJobName}, ${dedupKey}, 'PENDING', 0, now() - interval '10 minutes')
    `;
    await setup.$executeRaw`
      INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "dedupKey", "status", "attempts", "updatedAt")
      VALUES ('f044-live-pending-row', ${liveJobName}, ${dedupKey}, 'PENDING', 0, now())
    `;
    await setup.$executeRaw`
      INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "dedupKey", "status", "attempts", "updatedAt")
      VALUES ('f044-exhausted-retry-row', ${exhaustedJobName}, ${dedupKey}, 'PENDING', 2, now() - interval '10 minutes')
    `;

    const [staleFirst, staleSecond] = await Promise.all([
      createPgStore(staleA).claimDispatch(staleJobName, { dedupKey }, { reclaimStaleAfterSeconds: 60, maxAttempts: 3 }),
      createPgStore(staleB).claimDispatch(staleJobName, { dedupKey }, { reclaimStaleAfterSeconds: 60, maxAttempts: 3 }),
    ]);
    const [liveFirst, liveSecond] = await Promise.all([
      createPgStore(liveA).claimDispatch(liveJobName, { dedupKey }, { reclaimStaleAfterSeconds: 60, maxAttempts: 3 }),
      createPgStore(liveB).claimDispatch(liveJobName, { dedupKey }, { reclaimStaleAfterSeconds: 60, maxAttempts: 3 }),
    ]);
    const exhaustedClaim = await createPgStore(setup).claimDispatch(exhaustedJobName, { dedupKey }, { reclaimStaleAfterSeconds: 60, maxAttempts: 3 });
    const rows = await setup.$queryRaw<Array<{ jobName: string; status: string; attempts: number }>>`
      SELECT "jobName", "status", "attempts"
      FROM "ScheduledJobDispatch"
      WHERE "jobName" IN (${Prisma.join([staleJobName, liveJobName, exhaustedJobName])})
      ORDER BY "jobName"
    `;
    const evidence = {
      staleClaims: [staleFirst, staleSecond],
      staleWinnerCount: [staleFirst, staleSecond].filter(Boolean).length,
      liveClaims: [liveFirst, liveSecond],
      liveWinnerCount: [liveFirst, liveSecond].filter(Boolean).length,
      exhaustedClaim,
      rows,
    };
    console.log('F044_PHASE_A_RETRY_BY_STATUS_RACES', JSON.stringify(evidence));
    assert([liveFirst, liveSecond].filter(Boolean).length === 0, 'live PENDING dispatch must not be stolen by concurrent retry attempts');
    assert([staleFirst, staleSecond].filter(Boolean).length === 1, 'concurrent retries of one stale dispatch must have exactly one winner');
    assert(exhaustedClaim === false, 'exhausted retry must not be granted to a sender');
    assert(rows.find((row) => row.jobName === exhaustedJobName)?.status === 'ABANDONED', 'exhausted retry must land in ABANDONED');
  } finally {
    await resetRows(setup, [staleJobName, liveJobName, exhaustedJobName]);
    await Promise.all([setup.$disconnect(), staleA.$disconnect(), staleB.$disconnect(), liveA.$disconnect(), liveB.$disconnect()]);
  }
}

async function dispatchPolicyBinding() {
  const prisma = new PrismaClient();
  const declaredJobName = 'f044-bound-dispatch-policy';
  const defaultJobName = 'f044-default-dispatch-policy';
  const maxAttemptsJobName = 'f044-bound-max-attempts-policy';
  const dedupKey = 'same-occurrence';
  let declaredClaim: boolean | undefined;
  let defaultClaim: boolean | undefined;
  let maxAttemptsClaim: boolean | undefined;

  try {
    await resetRows(prisma, [declaredJobName, defaultJobName, maxAttemptsJobName]);
    await prisma.$executeRaw`
      INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "dedupKey", "status", "attempts", "updatedAt")
      VALUES
        ('f044-bound-dispatch-policy-row', ${declaredJobName}, ${dedupKey}, 'PENDING', 0, now() - interval '400 seconds'),
        ('f044-default-dispatch-policy-row', ${defaultJobName}, ${dedupKey}, 'PENDING', 0, now() - interval '400 seconds'),
        ('f044-bound-max-attempts-policy-row', ${maxAttemptsJobName}, ${dedupKey}, 'PENDING', 3, now() - interval '400 seconds')
    `;

    await createScheduler({
      store: createPgStore(prisma),
      tickMs: 60_000,
      jobs: [{
        name: declaredJobName,
        schedule: { everySeconds: 60 },
        timeoutSeconds: 600,
        minimumViableWindowSeconds: 180,
        dispatchReclaimStaleAfterSeconds: 900,
        async handler(ctx) {
          declaredClaim = await ctx.store.claimDispatch(declaredJobName, { dedupKey });
          return {};
        },
      }],
    }).runJobNow(declaredJobName);

    await createScheduler({
      store: createPgStore(prisma),
      tickMs: 60_000,
      jobs: [{
        name: defaultJobName,
        schedule: { everySeconds: 60 },
        timeoutSeconds: 60,
        minimumViableWindowSeconds: 180,
        async handler(ctx) {
          defaultClaim = await ctx.store.claimDispatch(defaultJobName, { dedupKey });
          return {};
        },
      }],
    }).runJobNow(defaultJobName);

    await createScheduler({
      store: createPgStore(prisma),
      tickMs: 60_000,
      jobs: [{
        name: maxAttemptsJobName,
        schedule: { everySeconds: 60 },
        timeoutSeconds: 60,
        minimumViableWindowSeconds: 180,
        dispatchMaxAttempts: 5,
        async handler(ctx) {
          maxAttemptsClaim = await ctx.store.claimDispatch(maxAttemptsJobName, { dedupKey });
          return {};
        },
      }],
    }).runJobNow(maxAttemptsJobName);

    const rows = await prisma.$queryRaw<Array<{ jobName: string; status: string; attempts: number }>>`
      SELECT "jobName", "status", "attempts"
      FROM "ScheduledJobDispatch"
      WHERE "jobName" IN (${Prisma.join([declaredJobName, defaultJobName, maxAttemptsJobName])})
      ORDER BY "jobName"
    `;
    const evidence = { declaredClaim, defaultClaim, maxAttemptsClaim, rows };
    console.log('F044_PHASE_A_DISPATCH_POLICY_BINDING', JSON.stringify(evidence));
    assert(declaredClaim === false, 'handler omission must use job-declared dispatchReclaimStaleAfterSeconds instead of defaulting to 300');
    assert(defaultClaim === true, 'handler omission must use scheduler default dispatchReclaimStaleAfterSeconds when job does not declare one');
    assert(maxAttemptsClaim === true, 'handler omission must use job-declared dispatchMaxAttempts instead of defaulting to 3');
    assert(rows.find((row) => row.jobName === declaredJobName)?.attempts === 0, 'job-declared stale window must leave 400-second PENDING unclaimed');
    assert(rows.find((row) => row.jobName === defaultJobName)?.attempts === 1, 'default stale window must reclaim 400-second PENDING');
    assert(rows.find((row) => row.jobName === maxAttemptsJobName)?.attempts === 4, 'job-declared max attempts must permit reclaim beyond default max');
  } finally {
    await resetRows(prisma, [declaredJobName, defaultJobName, maxAttemptsJobName]);
    await prisma.$disconnect();
  }
}

async function realStoreStatements() {
  const prisma = new PrismaClient();
  const store = createPgStore(prisma);
  const jobNames = ['f044-complete-release', 'f044-complete-retain', 'f044-prune'];
  const dispatchJobName = 'f044-dispatch-statements';
  try {
    await resetRows(prisma, [...jobNames, dispatchJobName]);
    await prisma.$executeRaw`
      INSERT INTO "ScheduledJob" ("name", "intervalSeconds", "timeoutSeconds", "nextRunAt", "lockedUntil", "updatedAt")
      VALUES
        ('f044-complete-release', 60, 30, now(), now() + interval '5 minutes', now()),
        ('f044-complete-retain', 60, 30, now(), now() + interval '5 minutes', now())
    `;
    await store.completeJob('f044-complete-release', { status: 'SUCCESS', durationMs: 10 }, { releaseLease: true, maxConsecutiveFailures: 3 });
    await store.completeJob('f044-complete-retain', { status: 'FAILED', error: 'kept lease', durationMs: 20 }, { releaseLease: false, maxConsecutiveFailures: 3 });

    await prisma.$executeRaw`
      INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "dedupKey", "status", "attempts", "lastError", "expiresAt", "updatedAt")
      VALUES
        ('f044-dispatch-mark', ${dispatchJobName}, 'mark', 'PENDING', 0, NULL, NULL, now()),
        ('f044-dispatch-fail', ${dispatchJobName}, 'fail', 'PENDING', 0, NULL, NULL, now()),
        ('f044-prune-old-1', 'f044-prune', 'old-1', 'PENDING', 0, NULL, now() - interval '1 minute', now()),
        ('f044-prune-old-2', 'f044-prune', 'old-2', 'PENDING', 0, NULL, now() - interval '2 minutes', now()),
        ('f044-prune-new', 'f044-prune', 'new', 'PENDING', 0, NULL, now() + interval '1 minute', now())
    `;
    await store.markDispatched(dispatchJobName, 'mark');
    await store.failDispatch(dispatchJobName, 'fail', 'send failed');
    const pruned = await store.pruneDispatches(new Date(), 1);

    const jobs = await prisma.$queryRaw<Array<{ name: string; lastRunStatus: string | null; consecutiveFailures: number; lockedUntil: Date | null; circuitOpenedAt: Date | null }>>`
      SELECT "name", "lastRunStatus", "consecutiveFailures", "lockedUntil", "circuitOpenedAt"
      FROM "ScheduledJob"
      WHERE "name" IN (${Prisma.join(['f044-complete-release', 'f044-complete-retain'])})
      ORDER BY "name"
    `;
    const dispatches = await prisma.$queryRaw<Array<{ dedupKey: string; status: string; attempts: number; lastError: string | null; dispatchedAt: Date | null; expiresAt: Date | null }>>`
      SELECT "dedupKey", "status", "attempts", "lastError", "dispatchedAt", "expiresAt"
      FROM "ScheduledJobDispatch"
      WHERE "jobName" IN (${Prisma.join([dispatchJobName, 'f044-prune'])})
      ORDER BY "dedupKey"
    `;
    const evidence = { jobs, dispatches, pruned };
    console.log('F044_PHASE_A_REAL_STORE_STATEMENTS', JSON.stringify(evidence));
    assert(jobs.find((job) => job.name === 'f044-complete-release')?.lockedUntil === null, 'completeJob releaseLease=true must clear lockedUntil');
    assert(!!jobs.find((job) => job.name === 'f044-complete-retain')?.lockedUntil, 'completeJob releaseLease=false must retain lockedUntil');
    assert(jobs.find((job) => job.name === 'f044-complete-retain')?.consecutiveFailures === 1, 'completeJob failure must increment consecutiveFailures');
    assert(dispatches.find((row) => row.dedupKey === 'mark')?.status === 'SENT', 'markDispatched must set SENT');
    assert(!!dispatches.find((row) => row.dedupKey === 'mark')?.dispatchedAt, 'markDispatched must set dispatchedAt');
    assert(dispatches.find((row) => row.dedupKey === 'fail')?.status === 'FAILED', 'failDispatch must set FAILED');
    assert(dispatches.find((row) => row.dedupKey === 'fail')?.attempts === 1, 'failDispatch must increment attempts');
    assert(dispatches.find((row) => row.dedupKey === 'fail')?.lastError === 'send failed', 'failDispatch must set lastError');
    assert(pruned === 1, 'pruneDispatches must honor batch limit');
    assert(dispatches.some((row) => row.dedupKey === 'old-1' || row.dedupKey === 'old-2'), 'pruneDispatches must leave one expired row when batchSize is one');
    assert(dispatches.some((row) => row.dedupKey === 'new'), 'pruneDispatches must leave future rows');
  } finally {
    await resetRows(prisma, [...jobNames, dispatchJobName]);
    await prisma.$disconnect();
  }
}

async function realCircuitBreaker() {
  const prisma = new PrismaClient();
  const store = createPgStore(prisma);
  const jobName = 'f044-real-circuit';
  try {
    await resetRows(prisma, [jobName]);
    await prisma.$executeRaw`
      INSERT INTO "ScheduledJob" ("name", "intervalSeconds", "timeoutSeconds", "nextRunAt", "updatedAt")
      VALUES (${jobName}, 60, 30, now() - interval '1 second', now())
    `;
    await store.completeJob(jobName, { status: 'FAILED', error: 'one', durationMs: 1 }, { releaseLease: true, maxConsecutiveFailures: 3 });
    await store.completeJob(jobName, { status: 'FAILED', error: 'two', durationMs: 1 }, { releaseLease: true, maxConsecutiveFailures: 3 });
    await store.completeJob(jobName, { status: 'FAILED', error: 'three', durationMs: 1 }, { releaseLease: true, maxConsecutiveFailures: 3 });
    const insideCooldown = await store.claimDueJob(jobName, 30, 3, 300);
    await prisma.$executeRaw`
      UPDATE "ScheduledJob"
      SET "circuitOpenedAt" = now() - interval '10 minutes',
          "nextRunAt" = now() - interval '1 second',
          "lockedUntil" = NULL
      WHERE "name" = ${jobName}
    `;
    const afterCooldown = await store.claimDueJob(jobName, 30, 3, 300);
    await store.completeJob(jobName, { status: 'SUCCESS', durationMs: 1 }, { releaseLease: true, maxConsecutiveFailures: 3 });
    const closed = await prisma.$queryRaw<Array<{ consecutiveFailures: number; circuitOpenedAt: Date | null }>>`
      SELECT "consecutiveFailures", "circuitOpenedAt" FROM "ScheduledJob" WHERE "name" = ${jobName}
    `;
    await prisma.$executeRaw`
      UPDATE "ScheduledJob"
      SET "consecutiveFailures" = 3,
          "circuitOpenedAt" = now() - interval '10 minutes',
          "nextRunAt" = now() - interval '1 second',
          "lockedUntil" = NULL
      WHERE "name" = ${jobName}
    `;
    const failedProbe = await store.claimDueJob(jobName, 30, 3, 300);
    await store.completeJob(jobName, { status: 'FAILED', error: 'probe failed', durationMs: 1 }, { releaseLease: true, maxConsecutiveFailures: 3 });
    const reopened = await prisma.$queryRaw<Array<{ consecutiveFailures: number; circuitOpenedAt: Date | null }>>`
      SELECT "consecutiveFailures", "circuitOpenedAt" FROM "ScheduledJob" WHERE "name" = ${jobName}
    `;
    const blockedAgain = await store.claimDueJob(jobName, 30, 3, 300);
    const evidence = { insideCooldown, afterCooldown, closed: closed[0], failedProbe, reopened: reopened[0], blockedAgain };
    console.log('F044_PHASE_A_REAL_CIRCUIT_BREAKER', JSON.stringify(evidence));
    assert(insideCooldown === null, 'open circuit must block inside cooldown');
    assert(!!afterCooldown, 'open circuit must allow one half-open claim after cooldown');
    assert(closed[0]?.consecutiveFailures === 0 && closed[0]?.circuitOpenedAt === null, 'success must close circuit and reset failures');
    assert(!!failedProbe, 'post-cooldown failed probe must be claimable');
    assert(reopened[0]?.consecutiveFailures >= 4 && !!reopened[0]?.circuitOpenedAt, 'failed probe must reopen circuit with fresh timestamp');
    assert(blockedAgain === null, 'freshly reopened circuit must block again');
  } finally {
    await resetRows(prisma, [jobName]);
    await prisma.$disconnect();
  }
}

type StoredRun = {
  name: string;
  enabled: boolean;
  intervalSeconds: number;
  timeoutSeconds: number;
  nextRunAt: Date;
  lockedUntil: Date | null;
  circuitOpenedAt: Date | null;
  consecutiveFailures: number;
  completed: Array<{ status: string; releaseLease: boolean | undefined }>;
};

class FakeStore implements ScheduledJobStore {
  readonly runs = new Map<string, StoredRun>();
  readonly occurrences = new Map<string, string>();
  now = new Date('2026-08-08T00:00:00.000Z');

  addRun(name: string, nextRunAt: Date, intervalSeconds = 60, timeoutSeconds = 60, consecutiveFailures = 0) {
    this.runs.set(name, {
      name,
      enabled: true,
      intervalSeconds,
      timeoutSeconds,
      nextRunAt,
      lockedUntil: null,
      circuitOpenedAt: null,
      consecutiveFailures,
      completed: [],
    });
  }

  async claimDueJob(name: string, leaseSeconds: number, maxConsecutiveFailures: number): Promise<ClaimResult | null> {
    const run = this.runs.get(name);
    if (!run || !run.enabled || run.consecutiveFailures >= maxConsecutiveFailures) return null;
    const due = run.nextRunAt.getTime() <= this.now.getTime();
    const unlocked = run.lockedUntil == null || run.lockedUntil.getTime() < this.now.getTime();
    if (!due || !unlocked) return null;
    const claimedDueAt = run.nextRunAt;
    run.nextRunAt = new Date(this.now.getTime() + run.intervalSeconds * 1000);
    run.lockedUntil = new Date(this.now.getTime() + leaseSeconds * 1000);
    return { name, claimedDueAt, nextRunAt: run.nextRunAt, consecutiveFailures: run.consecutiveFailures };
  }

  async completeJob(name: string, result: { status: JobRunSummary['status']; error?: string; durationMs: number }, options?: { releaseLease?: boolean; maxConsecutiveFailures?: number }) {
    const run = this.runs.get(name);
    if (!run) return;
    run.completed.push({ status: result.status, releaseLease: options?.releaseLease });
    if (result.status === 'SUCCESS') {
      run.consecutiveFailures = 0;
      run.circuitOpenedAt = null;
    } else {
      run.consecutiveFailures++;
      if (run.consecutiveFailures >= (options?.maxConsecutiveFailures ?? 3)) run.circuitOpenedAt = this.now;
    }
    if (options?.releaseLease !== false) run.lockedUntil = null;
  }

  async claimDispatch(jobName: string, key: DispatchKey): Promise<boolean> {
    const ledgerKey = `${jobName}:${key.dedupKey}`;
    if (this.occurrences.has(ledgerKey)) return false;
    this.occurrences.set(ledgerKey, 'PENDING');
    return true;
  }

  async markDispatched(jobName: string, dedupKey: string) {
    this.occurrences.set(`${jobName}:${dedupKey}`, 'SENT');
  }

  async failDispatch(jobName: string, dedupKey: string) {
    this.occurrences.set(`${jobName}:${dedupKey}`, 'FAILED');
  }

  async pruneDispatches() {
    return 0;
  }
}

async function missedChecks() {
  const recoveredStore = new FakeStore();
  const droppedStore = new FakeStore();
  const jobName = 'generic-stale-check';
  let recoveredHandlerCalls = 0;
  let droppedHandlerCalls = 0;
  const now = new Date('2026-08-08T00:10:00.000Z');
  recoveredStore.now = now;
  droppedStore.now = now;
  recoveredStore.addRun(jobName, new Date('2026-08-08T00:09:20.000Z'));
  droppedStore.addRun(jobName, new Date('2026-08-08T00:07:00.000Z'));

  const makeJob = (stateExpiresAt: Date, onRun: () => void): JobDefinition => ({
    name: jobName,
    schedule: { everySeconds: 60 },
    timeoutSeconds: 10,
    minimumViableWindowSeconds: 180,
    async handler(ctx) {
      if (ctx.now.getTime() > stateExpiresAt.getTime()) return { skipped: 1 };
      onRun();
      return { processed: 1 };
    },
  });

  const recoveredScheduler = createScheduler({
    store: recoveredStore,
    tickMs: 60_000,
    jobs: [makeJob(new Date('2026-08-08T00:11:00.000Z'), () => { recoveredHandlerCalls++; })],
  });
  const droppedScheduler = createScheduler({
    store: droppedStore,
    tickMs: 60_000,
    jobs: [makeJob(new Date('2026-08-08T00:09:00.000Z'), () => { droppedHandlerCalls++; })],
  });

  const recovered = await recoveredScheduler.runDueJobsOnce(now);
  const dropped = await droppedScheduler.runDueJobsOnce(now);
  const evidence = {
    recovered: {
      claimedDueAt: recovered[0]?.claimedDueAt?.toISOString(),
      status: recovered[0]?.status,
      processed: recovered[0]?.processed || 0,
      skipped: recovered[0]?.skipped || 0,
      handlerCalls: recoveredHandlerCalls,
    },
    stale: {
      claimedDueAt: dropped[0]?.claimedDueAt?.toISOString(),
      status: dropped[0]?.status,
      processed: dropped[0]?.processed || 0,
      skipped: dropped[0]?.skipped || 0,
      handlerCalls: droppedHandlerCalls,
    },
  };
  console.log('F044_PHASE_A_MISSED_CHECKS', JSON.stringify(evidence));
  assert(recovered[0]?.status === 'SUCCESS', 'within-window missed check must recover');
  assert(recoveredHandlerCalls === 1, 'recovered check must execute handler');
  assert((dropped[0]?.skipped || 0) === 1, 'stale missed check must be reported as skipped by handler predicate');
  assert(droppedHandlerCalls === 0, 'stale missed check must not execute domain action');
}

function startupAssertion() {
  const store = new FakeStore();
  let rejected = false;
  let staleWindowRejected = false;
  try {
    createScheduler({
      store,
      tickMs: 60_000,
      jobs: [{
        name: 'too-narrow',
        schedule: { everySeconds: 60 },
        minimumViableWindowSeconds: 60,
        async handler() {
          return { processed: 1 };
        },
      }],
    });
  } catch {
    rejected = true;
  }
  try {
    createScheduler({
      store,
      tickMs: 60_000,
      jobs: [{
        name: 'timeout-exceeds-default-stale',
        schedule: { everySeconds: 60 },
        timeoutSeconds: 600,
        minimumViableWindowSeconds: 180,
        async handler() {
          return { processed: 1 };
        },
      }],
    });
  } catch {
    staleWindowRejected = true;
  }
  console.log('F044_PHASE_A_STARTUP_ASSERTION', JSON.stringify({ rejected, staleWindowRejected }));
  assert(rejected, 'startup assertion must reject windows narrower than three ticks');
  assert(staleWindowRejected, 'startup assertion must reject dispatch reclaim windows that do not exceed timeout');
}

async function defectEvidence() {
  const failureIsolationStore = new FakeStore();
  failureIsolationStore.addRun('claim-throws', new Date('2026-08-07T23:59:00.000Z'));
  failureIsolationStore.addRun('still-runs', new Date('2026-08-07T23:59:00.000Z'));
  const originalClaim = failureIsolationStore.claimDueJob.bind(failureIsolationStore);
  failureIsolationStore.claimDueJob = async (name, leaseSeconds, maxFailures) => {
    if (name === 'claim-throws') throw new Error('claim exploded');
    return originalClaim(name, leaseSeconds, maxFailures);
  };
  let stillRuns = 0;
  const isolation = await createScheduler({
    store: failureIsolationStore,
    tickMs: 1000,
    jobs: [
      { name: 'claim-throws', schedule: { everySeconds: 60 }, minimumViableWindowSeconds: 3, async handler() { return {}; } },
      { name: 'still-runs', schedule: { everySeconds: 60 }, minimumViableWindowSeconds: 3, async handler() { stillRuns++; return { processed: 1 }; } },
    ],
  }).runDueJobsOnce(failureIsolationStore.now);

  const timeoutStore = new FakeStore();
  timeoutStore.addRun('timeout-job', new Date('2026-08-07T23:59:00.000Z'));
  let orphanStillRunning = true;
  const timeout = await createScheduler({
    store: timeoutStore,
    tickMs: 1000,
    jobs: [{
      name: 'timeout-job',
      schedule: { everySeconds: 60 },
      timeoutSeconds: 1,
      minimumViableWindowSeconds: 3,
      async handler() {
        await delay(1500);
        orphanStillRunning = false;
        return { processed: 1 };
      },
    }],
  }).runDueJobsOnce(timeoutStore.now);

  const manualStore = new FakeStore();
  manualStore.addRun('manual-job', new Date('2026-08-07T23:59:00.000Z'));
  const manualRun = manualStore.runs.get('manual-job')!;
  manualRun.lockedUntil = new Date('2026-08-08T00:05:00.000Z');
  await createScheduler({
    store: manualStore,
    tickMs: 1000,
    jobs: [{ name: 'manual-job', schedule: { everySeconds: 60 }, minimumViableWindowSeconds: 3, async handler() { return { processed: 1 }; } }],
  }).runJobNow('manual-job', manualStore.now);

  const circuitStore = new FakeStore();
  circuitStore.addRun('circuit-job', new Date('2026-08-07T23:59:00.000Z'), 60, 60, 3);
  let circuitHandlerCalls = 0;
  const circuit = await createScheduler({
    store: circuitStore,
    tickMs: 1000,
    jobs: [{ name: 'circuit-job', schedule: { everySeconds: 60 }, maxConsecutiveFailures: 3, minimumViableWindowSeconds: 3, async handler() { circuitHandlerCalls++; return { processed: 1 }; } }],
  }).runDueJobsOnce(circuitStore.now);

  const timeoutTextStore = new FakeStore();
  timeoutTextStore.addRun('timeout-text-job', new Date('2026-08-07T23:59:00.000Z'));
  const timeoutText = await createScheduler({
    store: timeoutTextStore,
    tickMs: 1000,
    jobs: [{ name: 'timeout-text-job', schedule: { everySeconds: 60 }, timeoutSeconds: 10, minimumViableWindowSeconds: 3, async handler() { throw new Error('business rule timed out upstream'); } }],
  }).runDueJobsOnce(timeoutTextStore.now);

  const evidence = {
    failureIsolation: { statuses: isolation.map((run) => [run.jobName, run.status]), stillRuns },
    timeoutLease: {
      status: timeout[0]?.status,
      releaseLease: timeoutStore.runs.get('timeout-job')?.completed[0]?.releaseLease,
      lockedUntilStillSet: !!timeoutStore.runs.get('timeout-job')?.lockedUntil,
      orphanStillRunningAtReturn: orphanStillRunning,
    },
    manualLease: {
      releaseLease: manualStore.runs.get('manual-job')?.completed[0]?.releaseLease,
      lockedUntil: manualStore.runs.get('manual-job')?.lockedUntil?.toISOString(),
    },
    circuitBreaker: { returnedRuns: circuit.length, handlerCalls: circuitHandlerCalls },
    timeoutClassification: { status: timeoutText[0]?.status, error: timeoutText[0]?.error },
  };
  console.log('F044_PHASE_A_DEFECT_FIXES', JSON.stringify(evidence));
  assert(stillRuns === 1, 'failure isolation must let a second job run when first claim throws');
  assert(timeout[0]?.status === 'TIMEOUT', 'real timeout branch must classify as TIMEOUT');
  assert(timeoutStore.runs.get('timeout-job')?.completed[0]?.releaseLease === false, 'timeout completion must not release lease');
  assert(manualStore.runs.get('manual-job')?.completed[0]?.releaseLease === false, 'manual run must not release lease');
  assert(circuit.length === 0 && circuitHandlerCalls === 0, 'circuit breaker must suppress claim at max failures');
  assert(timeoutText[0]?.status === 'FAILED', 'handler error text containing timed out must not be classified as TIMEOUT');
}

function rgNoDomainMatches() {
  try {
    return execFileSync('rg', [
      'court|badminton|booking|member|slot|guest|player|notification',
      'packages/job-scheduler/src',
      '-n',
    ], { cwd: repoRoot(), encoding: 'utf8', shell: false }).trim();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return '';
    throw error;
  }
}

function genericity() {
  const packageJsonPath = path.join(repoRoot(), 'packages', 'job-scheduler', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { dependencies?: Record<string, string> };
  const grep = rgNoDomainMatches();
  const evidence = {
    packageJsonPath,
    runtimeDependencies: packageJson.dependencies || {},
    grepMatches: grep ? grep.split(/\r?\n/) : [],
  };
  console.log('F044_PHASE_A_REAL_GENERICITY', JSON.stringify(evidence));
  assert(Object.keys(packageJson.dependencies || {}).length === 0, 'runtime dependencies must be empty');
  assert(!grep, 'generic source must not contain domain terms');
}

function findingsUntouched() {
  const changed = execFileSync('git', ['diff', '--name-only'], { cwd: repoRoot(), encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const status = execFileSync('git', ['status', '--short'], { cwd: repoRoot(), encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
  const statusFiles = status.map((line) => line.slice(3));
  const forbidden = [
    'services/slot-engine/src/index.ts',
    'services/slot-engine/src/jobs/memberConfirmationReminder.ts',
    'services/slot-engine/src/scheduledJobStore.ts',
    'services/notification/src/index.ts',
  ];
  const touchedForbidden = Array.from(new Set([...changed, ...statusFiles])).filter((file) => forbidden.includes(file));
  const evidence = {
    changedFiles: changed,
    statusFiles,
    touchedForbidden,
    sweepWiringTouched: touchedForbidden.includes('services/slot-engine/src/index.ts'),
  };
  console.log('F044_PHASE_A_FINDINGS_UNTOUCHED_REAL', JSON.stringify(evidence));
  assert(touchedForbidden.length === 0, 'Phase A must not touch findings A-D-adjacent implementation files');
}

async function main() {
  console.log('F044_PHASE_A_CLAIM_SQL', CLAIM_DUE_JOB_SQL);
  await realEmittedSql();
  await realClaimConcurrency();
  await retryByStatusRaces();
  await dispatchPolicyBinding();
  await realDedupConstraint();
  await rawUniqueCodeEvidence();
  await realStoreStatements();
  await realCircuitBreaker();
  await missedChecks();
  startupAssertion();
  await defectEvidence();
  genericity();
  findingsUntouched();
  console.log('F044_PHASE_A_SKIP_IF_DELAYED_DECISION', JSON.stringify({
    decision: 'removed',
    rationale: 'runtime elapsed-delay staleness conflicts with the plan; handlers must decide staleness from live domain state at execution time',
  }));
  console.log('F044_PHASE_A_OK');
}

main().catch((error) => {
  console.error('F044_PHASE_A_FAILED', error);
  process.exit(1);
});
