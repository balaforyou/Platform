#!/usr/bin/env node
/**
 * Provisions a customer tenant end to end: tenant, branches, resource pools, named resources,
 * booking rules and recurring availability patterns.
 *
 * WHY THIS EXISTS AS A REAL SCRIPT. There is no admin UI for creating resource pools or
 * resources (F-098), so every tenant onboarded today is onboarded by internal-key API calls.
 * That alone made this worth keeping. What made it necessary is F-101: the regression suites
 * wipe the whole database, and a provisioned customer demo was destroyed twice in one session
 * before the guard existed. Re-provisioning is a recovery step, not a one-off, and a recovery
 * step that lives in a scratch directory is not a recovery step.
 *
 * Reads its input from a JSON file so the customer's real data is not baked into the tool:
 *
 *   node scripts/provision-tenant.mjs --config scripts/tenants/jbc.json
 *   node scripts/provision-tenant.mjs --config scripts/tenants/jbc.json --dry-run
 *
 * Idempotent by design: an existing tenant (matched on subdomain) or branch (matched on name)
 * is updated rather than duplicated, so re-running after a wipe or a partial failure converges
 * instead of creating a second copy.
 *
 * NOTE on branch timezone (F-100): branches are created at whatever `timezone` the config sets,
 * defaulting to UTC. Setting a real zone activates F-087 — availability-window creation parses
 * naive datetimes against the server clock while judging boundaries against the branch clock.
 * Availability here is created as recurring PATTERNS, which carry HH:mm plus ISO weekdays and
 * never reach that parser, but one-off windows created elsewhere would still be affected.
 */

import { readFileSync } from 'node:fs';
import { argv, env, exitCode } from 'node:process';

const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const DRY = argv.includes('--dry-run');

const TENANT_URL = env.TENANT_SERVICE_URL || 'http://localhost:3003';
const SLOT_URL = env.SLOT_ENGINE_URL || 'http://localhost:3001';
const KEY = env.INTERNAL_SERVICE_KEY || 'test-service-key';
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

const configPath = arg('--config');
if (!configPath) {
  console.error('Usage: node scripts/provision-tenant.mjs --config <file.json> [--dry-run]');
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));

async function call(base, method, path, body) {
  if (DRY) { console.log(`  [dry-run] ${method} ${path}`); return { id: `dry-${Math.random().toString(36).slice(2, 10)}`, ...body }; }
  const res = await fetch(`${base}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json?.data ?? json;
}
const tenantApi = (m, p, b) => call(TENANT_URL, m, p, b);
const slotApi = (m, p, b) => call(SLOT_URL, m, p, b);

async function main() {
  console.log(`Provisioning "${cfg.tenant.name}" (${cfg.tenant.subdomain})${DRY ? ' [DRY RUN]' : ''}\n`);

  // 1. Tenant — reuse if the subdomain already resolves.
  let tenant = null;
  if (!DRY) {
    const existing = await fetch(`${TENANT_URL}/tenants/by-subdomain/${cfg.tenant.subdomain}`)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (existing?.data) tenant = existing.data;
  }
  if (tenant) console.log(`tenant       reused   ${tenant.id}`);
  else {
    tenant = await tenantApi('POST', '/tenants', cfg.tenant);
    console.log(`tenant       created  ${tenant.id}`);
  }

  const existingBranches = DRY ? [] : await tenantApi('GET', `/tenants/${tenant.id}/branches?includeDraft=true`);
  const summary = [];

  for (const spec of cfg.branches) {
    const { pool: poolSpec, ...branchFields } = spec;

    // 2. Branch. POST hardcodes status DRAFT and accepts no status argument, and guest browse
    // is ACTIVE-only — so activation is always a second call, never optional.
    let branch = existingBranches.find((b) => b.name === branchFields.name);
    if (branch) {
      branch = await tenantApi('PATCH', `/branches/${branch.id}`, { ...branchFields, status: 'ACTIVE' });
      console.log(`branch       updated  ${branch.id}  ${branch.name}`);
    } else {
      branch = await tenantApi('POST', `/tenants/${tenant.id}/branches`, branchFields);
      branch = await tenantApi('PATCH', `/branches/${branch.id}`, { status: 'ACTIVE' });
      console.log(`branch       created  ${branch.id}  ${branch.name}`);
    }

    if (!poolSpec) { summary.push({ branch: branch.name, branchId: branch.id }); continue; }

    // 3. Resource pool.
    const pool = await slotApi('POST', '/resource-pools', {
      tenantId: tenant.id,
      branchId: branch.id,
      name: poolSpec.name,
      allocationMode: poolSpec.allocationMode ?? 'POOLED',
      capacity: poolSpec.capacity ?? (poolSpec.resources?.length || 1),
      minOccupancy: poolSpec.minOccupancy ?? 1,
      minBookingDurationMinutes: poolSpec.minBookingDurationMinutes ?? 60,
      pricingMode: poolSpec.pricingMode ?? 'FLAT',
      defaultRate: poolSpec.defaultRate ?? 100,
    });
    console.log(`pool         ${pool.id}  cap=${pool.capacity} min=${pool.minOccupancy} rate=${pool.defaultRate}`);

    // 4. Named resources.
    for (const name of poolSpec.resources ?? []) {
      await slotApi('POST', `/resource-pools/${pool.id}/resources`, { name });
    }
    if (poolSpec.resources?.length) console.log(`resources    ${poolSpec.resources.length}  [${poolSpec.resources.join(', ')}]`);

    // 5. Booking rule.
    if (poolSpec.bookingRule) {
      const rule = await slotApi('POST', '/booking-rules', { resourcePoolId: pool.id, ...poolSpec.bookingRule });
      console.log(`booking rule ${rule.id}`);
    }

    // 6. Availability as a recurring pattern — HH:mm plus ISO weekdays, generated lazily per
    //    date, so it never touches the naive-datetime parser F-087 describes.
    if (poolSpec.availabilityPattern) {
      const pattern = await slotApi('POST', `/resource-pools/${pool.id}/availability-patterns`, poolSpec.availabilityPattern);
      console.log(`pattern      ${pattern.id}  ${poolSpec.availabilityPattern.startTime}-${poolSpec.availabilityPattern.endTime}`);
    }

    console.log('');
    summary.push({ branch: branch.name, branchId: branch.id, poolId: pool.id });
  }

  console.log('--- provisioned ---');
  console.log(`tenant ${tenant.id}  (${cfg.tenant.subdomain})`);
  for (const s of summary) console.log(JSON.stringify(s));
}

main().catch((e) => {
  console.error(`\nprovision-tenant failed: ${e.message}`);
  process.exitCode = 1;
});
