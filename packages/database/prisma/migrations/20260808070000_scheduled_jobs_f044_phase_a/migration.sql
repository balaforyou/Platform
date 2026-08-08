CREATE TABLE "ScheduledJob" (
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalSeconds" INTEGER NOT NULL,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunError" TEXT,
    "lastRunDurationMs" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitOpenedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("name"),
    CONSTRAINT "ScheduledJob_intervalSeconds_check" CHECK ("intervalSeconds" > 0),
    CONSTRAINT "ScheduledJob_timeoutSeconds_check" CHECK ("timeoutSeconds" > 0)
);

CREATE TABLE "ScheduledJobDispatch" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "tenantId" TEXT,
    "subjectId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "occurrenceAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJobDispatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledJob_enabled_nextRunAt_idx" ON "ScheduledJob"("enabled", "nextRunAt");
CREATE UNIQUE INDEX "ScheduledJobDispatch_jobName_dedupKey_key" ON "ScheduledJobDispatch"("jobName", "dedupKey");
CREATE INDEX "ScheduledJobDispatch_jobName_status_createdAt_idx" ON "ScheduledJobDispatch"("jobName", "status", "createdAt");
CREATE INDEX "ScheduledJobDispatch_expiresAt_idx" ON "ScheduledJobDispatch"("expiresAt");
