#!/usr/bin/env node
/**
 * F-077: refuse to migrate from a stale or unverifiable image.
 *
 * On 9 Aug 2026 a deploy rebuilt the application services but served `migrate` from a
 * cached image built before three migrations existed. It reported "No pending migrations
 * to apply." and exited 0 — output indistinguishable from success — leaving production
 * running new code against a nine-day-old schema.
 *
 * A migration COUNT check cannot catch that: a stale image carries 9 migrations, the
 * database it already migrated has 9, they agree, and it passes. The only reliable signal
 * is the SHA this image was BUILT from versus the SHA the deploy INTENDS to run.
 *
 * WHY FAIL-CLOSED ON A MISSING EXPECTATION:
 * This script runs ONLY as the migrate container's command (see docker-compose.yml). No
 * package.json script invokes it, and local development uses `prisma migrate dev` or
 * `prisma:deploy` directly. So executing at all already implies "inside a deploy" — there
 * is no legitimate local-dev path through here. An absent EXPECTED_GIT_SHA therefore means
 * the deploy forgot to export GIT_SHA, not that someone is developing locally. Skipping in
 * that case would reproduce F-077 exactly: a guard that silently no-ops and lets a stale
 * image through while appearing to have run.
 *
 * The bypass exists, but it is explicit, named, and announced.
 */

const built = process.env.BUILD_GIT_SHA;
const expected = process.env.EXPECTED_GIT_SHA;
const bypass = process.env.ALLOW_UNVERIFIED_MIGRATE === '1';

function fail(lines) {
  for (const l of lines) console.error(l);
  console.error('');
  console.error('  To migrate anyway — deliberately, and only if you know why:');
  console.error('    ALLOW_UNVERIFIED_MIGRATE=1 docker compose --env-file .env run --rm migrate');
  process.exitCode = 1;
}

/**
 * WHY this is persisted rather than only printed: the migrate container runs with --rm,
 * so its console output belongs to whoever happened to be watching that terminal. A
 * bypassed deploy must be visible to whoever looks NEXT — otherwise the escape hatch is
 * effectively invisible, which is the failure mode it was kept visible to avoid.
 *
 * The database is the one store that survives the container and that anyone diagnosing a
 * deployment is already connected to. Imported dynamically so the normal path stays a pure
 * environment check with no database dependency or failure mode.
 */
async function recordBypass() {
  try {
    const { PrismaClient } = await import('../src/generated/client/index.js');
    const prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_deploy_audit" (
        "id" SERIAL PRIMARY KEY,
        "at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "event" TEXT NOT NULL,
        "builtSha" TEXT,
        "expectedSha" TEXT,
        "note" TEXT
      )`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_deploy_audit" ("event","builtSha","expectedSha","note") VALUES ($1,$2,$3,$4)`,
      'MIGRATE_VERIFICATION_BYPASSED',
      built || null,
      expected || null,
      'ALLOW_UNVERIFIED_MIGRATE=1 — migrations applied from an UNVERIFIED image (F-077).',
    );
    await prisma.$disconnect();
    console.warn('  Recorded in "_deploy_audit". Check it with:');
    console.warn('    SELECT * FROM "_deploy_audit" ORDER BY "at" DESC LIMIT 5;');
  } catch (e) {
    // WHY: the bypass was requested explicitly, so a failure to record it must not block
    // the migration — but it must be impossible to miss that the record was NOT written.
    console.warn(`  !! COULD NOT RECORD THE BYPASS: ${e.message}`);
    console.warn('  !! This deploy is unverified AND unrecorded. Note it manually.');
  }
}

if (bypass) {
  console.warn('[verify-build-sha] WARNING: ALLOW_UNVERIFIED_MIGRATE=1 — build verification BYPASSED.');
  console.warn(`  image built from : ${built || '(none)'}`);
  console.warn(`  deploy expects   : ${expected || '(none)'}`);
  console.warn('  This deploy is NOT verified. F-077 exists because an unverified deploy');
  console.warn('  ran for nine days without anyone noticing.');
  await recordBypass();
  process.exitCode = 0;
} else if (!expected) {
  // The case that previously skipped silently.
  fail([
    '[verify-build-sha] FAIL: EXPECTED_GIT_SHA is not set — cannot verify this deploy.',
    `  this image was built from : ${built || '(none)'}`,
    '  The deploy did not supply the SHA it intends to run. Export it first:',
    '    export GIT_SHA=$(cat ~/badminton-platform/BUILD_SHA)',
    '  Refusing rather than skipping: a guard that no-ops on a missing variable is',
    '  precisely the failure F-077 records.',
  ]);
} else if (!built || built === 'unknown') {
  fail([
    '[verify-build-sha] FAIL: this image carries no BUILD_GIT_SHA.',
    `  the deploy intends to run : ${expected}`,
    '  The image was built without the GIT_SHA build arg, or predates F-077. Rebuild it:',
    '    docker compose --env-file .env build migrate',
  ]);
} else if (built !== expected) {
  fail([
    '[verify-build-sha] FAIL: stale image — refusing to migrate.',
    `  this image was built from : ${built}`,
    `  the deploy intends to run : ${expected}`,
    '  Docker served a cached image. Rebuild it explicitly:',
    '    docker compose --env-file .env build migrate',
    '  (add --no-cache if the layer cache is still being reused)',
  ]);
} else {
  console.log(`[verify-build-sha] ok — image matches the deploy target (${built}).`);
  process.exitCode = 0;
}
