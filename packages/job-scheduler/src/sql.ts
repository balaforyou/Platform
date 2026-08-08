export const CLAIM_DUE_JOB_SQL = `
WITH due AS (
  SELECT "name", "nextRunAt"
    FROM "ScheduledJob"
   WHERE "name" = $1
     AND "enabled" = true
     AND "nextRunAt" <= now()
     AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
     AND (
       "consecutiveFailures" < $3
       OR "circuitOpenedAt" IS NULL
       OR "circuitOpenedAt" < now() - make_interval(secs => $4)
     )
   FOR UPDATE
)
UPDATE "ScheduledJob"
   SET "nextRunAt" = now() + make_interval(secs => "intervalSeconds"),
       "lastRunAt" = now(),
       "lockedUntil" = now() + make_interval(secs => $2)
  FROM due
 WHERE "ScheduledJob"."name" = due."name"
RETURNING "ScheduledJob"."name",
          due."nextRunAt" AS "claimedDueAt",
          "ScheduledJob"."nextRunAt" AS "nextRunAt",
          "ScheduledJob"."consecutiveFailures" AS "consecutiveFailures";
`.trim();
