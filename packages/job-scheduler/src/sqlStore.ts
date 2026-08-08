import { randomUUID } from 'crypto';
import { CLAIM_DUE_JOB_SQL } from './sql.js';
import type { ClaimResult, DispatchClaimOptions, DispatchKey, RunStatus, ScheduledJobStore } from './types.js';

export interface SqlExecutor {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<number>;
}

const COMPLETE_JOB_SQL = `
UPDATE "ScheduledJob"
   SET "lastRunStatus" = $2,
       "lastRunError" = $3,
       "lastRunDurationMs" = $4,
       "consecutiveFailures" = CASE WHEN $2 = 'SUCCESS' THEN 0 ELSE "consecutiveFailures" + 1 END,
       "circuitOpenedAt" = CASE
         WHEN $2 = 'SUCCESS' THEN NULL
         WHEN "consecutiveFailures" + 1 >= $6 THEN now()
         ELSE "circuitOpenedAt"
       END,
       "lockedUntil" = CASE WHEN $5 THEN NULL ELSE "lockedUntil" END
 WHERE "name" = $1;
`.trim();

const CLAIM_DISPATCH_SQL = `
INSERT INTO "ScheduledJobDispatch" ("id", "jobName", "tenantId", "subjectId", "dedupKey", "status", "occurrenceAt", "expiresAt", "updatedAt")
VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, now())
ON CONFLICT ("jobName", "dedupKey") DO UPDATE
   SET "attempts" = "ScheduledJobDispatch"."attempts" + 1,
       "status" = CASE
         WHEN "ScheduledJobDispatch"."attempts" + 1 >= $8 THEN 'ABANDONED'
         ELSE 'PENDING'
       END,
       "updatedAt" = now()
 WHERE "ScheduledJobDispatch"."attempts" < $8
   AND (
     "ScheduledJobDispatch"."status" = 'FAILED'
     OR (
       "ScheduledJobDispatch"."status" = 'PENDING'
       AND "ScheduledJobDispatch"."updatedAt" < now() - make_interval(secs => $9)
     )
   )
RETURNING "id", "status";
`.trim();

const MARK_DISPATCHED_SQL = `
UPDATE "ScheduledJobDispatch"
   SET "status" = 'SENT',
       "dispatchedAt" = now(),
       "lastError" = NULL
 WHERE "jobName" = $1
   AND "dedupKey" = $2;
`.trim();

const FAIL_DISPATCH_SQL = `
UPDATE "ScheduledJobDispatch"
   SET "status" = 'FAILED',
       "attempts" = "attempts" + 1,
       "lastError" = $3
 WHERE "jobName" = $1
   AND "dedupKey" = $2;
`.trim();

const PRUNE_DISPATCHES_SQL = `
DELETE FROM "ScheduledJobDispatch"
 WHERE "id" IN (
   SELECT "id"
     FROM "ScheduledJobDispatch"
    WHERE "expiresAt" IS NOT NULL
      AND "expiresAt" < $1
    ORDER BY "expiresAt" ASC
    LIMIT $2
 )
RETURNING "id";
`.trim();

export function createSqlScheduledJobStore(executor: SqlExecutor): ScheduledJobStore {
  return {
    async claimDueJob(name: string, leaseSeconds: number, maxConsecutiveFailures: number, cooldownSeconds: number): Promise<ClaimResult | null> {
      const rows = await executor.query<ClaimResult>(CLAIM_DUE_JOB_SQL, [name, leaseSeconds, maxConsecutiveFailures, cooldownSeconds]);
      return rows[0] || null;
    },

    async completeJob(name: string, result: { status: RunStatus; error?: string; durationMs: number }, options = { releaseLease: true, maxConsecutiveFailures: 3 }) {
      await executor.execute(COMPLETE_JOB_SQL, [
        name,
        result.status,
        result.error || null,
        result.durationMs,
        options.releaseLease !== false,
        options.maxConsecutiveFailures ?? 3,
      ]);
    },

    async claimDispatch(jobName: string, key: DispatchKey, options?: DispatchClaimOptions) {
      const rows = await executor.query<{ id: string; status: string }>(CLAIM_DISPATCH_SQL, [
        randomUUID(),
        jobName,
        key.tenantId || null,
        key.subjectId || null,
        key.dedupKey,
        key.occurrenceAt || null,
        key.expiresAt || null,
        options?.maxAttempts ?? 3,
        options?.reclaimStaleAfterSeconds ?? 300,
      ]);
      return rows[0]?.status === 'PENDING';
    },

    async markDispatched(jobName: string, dedupKey: string) {
      await executor.execute(MARK_DISPATCHED_SQL, [jobName, dedupKey]);
    },

    async failDispatch(jobName: string, dedupKey: string, error: string) {
      await executor.execute(FAIL_DISPATCH_SQL, [jobName, dedupKey, error]);
    },

    async pruneDispatches(before: Date, batchSize: number) {
      const rows = await executor.query<{ id: string }>(PRUNE_DISPATCHES_SQL, [before, batchSize]);
      return rows.length;
    },
  };
}
