#!/usr/bin/env node
/**
 * F-328 Part B: rename JBC's two branches and their pools through the EXISTING admin APIs
 * (PATCH /branches/:id on tenant-management, PATCH /resource-pools/:id on slot-engine) -- no SQL.
 *
 *   node scripts/f328/rename-jbc-venues.mjs            # dry run (default): prints before + planned, writes nothing
 *   node scripts/f328/rename-jbc-venues.mjs --apply    # performs the renames, then reads everything back
 *
 * Env: TENANT_SERVICE_URL (default http://localhost:3003), SLOT_ENGINE_URL (default http://localhost:3001),
 * INTERNAL_SERVICE_KEY. Optional --subdomain (default jbc). Both URLs must pass the fixed allowlist in
 * validateBaseUrl (no override flag); `--self-test` runs the allowlist cases with no network call.
 *
 * Mapping (Bala, 1 Oct 2026):
 *   "Japan Badminton Court, Coimbatore"  -> "JBC Old Court"   pool -> "JBC Old Court - Main Courts"
 *   "JBC – New Japan Badminton Court"    -> "JBC New Court"   pool -> "JBC New Court - Main Courts"
 * The pool keeps the branch name as a plain-hyphen prefix so displayPoolNameHome / displayPoolName /
 * normalizeDashes keep stripping it ("Main Courts" on the card). Tenant name and app name untouched.
 *
 * Safe to re-run: a branch already carrying its new name is left alone (idempotent). Branches are
 * matched by their exact old (or new) name; anything unexpected aborts BEFORE any write.
 */
import { argv, env } from 'node:process';
import { pathToFileURL } from 'node:url';

// Base-URL allowlist (PR #129 review). INTERNAL_SERVICE_KEY is sent as a Bearer token to whatever base URL
// is configured, so each URL is validated against a FIXED allowlist, in code, before the key is ever read
// into a header. There is deliberately no override flag and no env switch: neither can be trusted.
// Each kind is valid only for its own service (the tenant URL cannot point at slot-engine, and vice versa).
const PROD_HOST = 'jbc.elitecourts.duckdns.org';
const ALLOWED = {
  tenant: { prodPath: '/api/tenant', composeOrigin: 'http://tenant-management:3003' },
  slot: { prodPath: '/api/slot-engine', composeOrigin: 'http://slot-engine:3001' },
};
/** Returns the canonical base URL (no trailing slash) or throws. Pure: no network, no env. */
export function validateBaseUrl(kind, raw) {
  const rule = ALLOWED[kind];
  if (!rule) throw new Error(`unknown service kind ${JSON.stringify(kind)}`);
  const bad = (why) => new Error(`${kind} base URL ${JSON.stringify(raw)} rejected: ${why}. Allowed: http://localhost:<port>, http://127.0.0.1:<port>, ${rule.composeOrigin}, https://${PROD_HOST}${rule.prodPath}`);
  let u;
  try { u = new URL(raw); } catch { throw bad('not a valid URL'); }
  if (u.username || u.password) throw bad('userinfo is not allowed');
  if (u.search || u.hash) throw bad('query or fragment is not allowed');
  const path = u.pathname === '/' ? '' : u.pathname;
  if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.protocol === 'http:') {
    if (path) throw bad('loopback URLs take no path');
    return u.origin;
  }
  if (u.origin === rule.composeOrigin) {
    if (path) throw bad('compose-internal URLs take no path');
    return u.origin;
  }
  if (u.protocol === 'https:' && u.hostname === PROD_HOST && u.port === '') {
    if (path !== rule.prodPath) throw bad(`path must be exactly ${rule.prodPath}`);
    return `${u.origin}${path}`;
  }
  throw bad('host/scheme is not on the allowlist');
}

const SELF_TEST_CASES = [
  // [kind, url, shouldPass]
  ['tenant', 'http://localhost:3003', true],
  ['slot', 'http://127.0.0.1:3001/', true],
  ['tenant', 'http://tenant-management:3003', true],
  ['slot', 'http://slot-engine:3001', true],
  ['tenant', `https://${PROD_HOST}/api/tenant`, true],
  ['slot', `https://${PROD_HOST}/api/slot-engine`, true],
  ['tenant', `https://${PROD_HOST}.evil.com/api/tenant`, false],
  ['tenant', `http://${PROD_HOST}/api/tenant`, false],
  ['tenant', `https://${PROD_HOST}/api/slot-engine`, false],
  ['slot', `https://${PROD_HOST}/api/tenant`, false],
  ['tenant', `https://${PROD_HOST}/api/tenant/`, false],
  ['tenant', 'https://evil.example.com/api/tenant', false],
  ['tenant', `https://user:pass@${PROD_HOST}/api/tenant`, false],
  ['tenant', 'http://localhost@evil.com:3003', false],
  ['tenant', 'http://localhost:3003?x=1', false],
  ['tenant', 'http://slot-engine:3001', false],
  ['slot', 'http://tenant-management:3003', false],
  ['tenant', 'http://tenant-management:3003/x', false],
  ['tenant', 'ftp://localhost:3003', false],
  ['tenant', 'not a url', false],
];
function selfTest() {
  let failed = 0;
  for (const [kind, url, shouldPass] of SELF_TEST_CASES) {
    let outcome; try { outcome = `accepted -> ${validateBaseUrl(kind, url)}`; } catch (e) { outcome = `rejected (${e.message.split(' rejected: ')[1]?.split('. Allowed')[0] ?? e.message})`; }
    const passed = outcome.startsWith('accepted') === shouldPass;
    if (!passed) failed++;
    console.log(`${passed ? 'PASS' : 'FAIL'}  [${kind}] ${url}  =>  ${outcome}`);
  }
  console.log(`\n${SELF_TEST_CASES.length - failed}/${SELF_TEST_CASES.length} self-test cases behaved as expected (no network call made)`);
  process.exitCode = failed ? 1 : 0;
}

const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const SUBDOMAIN = arg('--subdomain', 'jbc');
let TENANT_URL; let SLOT_URL; let H;
function configure() {
  // Order matters: validate the URLs FIRST, only then read the key into a header.
  TENANT_URL = validateBaseUrl('tenant', env.TENANT_SERVICE_URL || 'http://localhost:3003');
  SLOT_URL = validateBaseUrl('slot', env.SLOT_ENGINE_URL || 'http://localhost:3001');
  const KEY = env.INTERNAL_SERVICE_KEY;
  if (!KEY) { throw new Error('INTERNAL_SERVICE_KEY is required (no test-key fallback: this can run against production).'); }
  H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
}

const MAP = [
  { oldName: 'Japan Badminton Court, Coimbatore', newName: 'JBC Old Court', newPool: 'JBC Old Court - Main Courts' },
  { oldName: 'JBC – New Japan Badminton Court', newName: 'JBC New Court', newPool: 'JBC New Court - Main Courts' }, // en dash U+2013
];

async function call(base, method, path, body) {
  const res = await fetch(`${base}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json?.data ?? json;
}

async function snapshot(tenantId) {
  const branches = await call(TENANT_URL, 'GET', `/tenants/${tenantId}/branches?includeDraft=true`);
  const out = [];
  for (const b of branches) {
    const pools = await call(SLOT_URL, 'GET', `/branches/${b.id}/resource-pools`);
    out.push({ branchId: b.id, branch: b.name, pools: (Array.isArray(pools) ? pools : pools?.pools ?? []).map((p) => ({ poolId: p.id, pool: p.name })) });
  }
  return out;
}
const show = (label, snap) => {
  console.log(`\n${label}`);
  for (const s of snap) { console.log(`  branch ${s.branchId}  ${JSON.stringify(s.branch)}`); for (const p of s.pools) console.log(`    pool ${p.poolId}  ${JSON.stringify(p.pool)}`); }
};

async function main() {
  configure();
  console.log(`F-328 venue rename for tenant "${SUBDOMAIN}" @ ${TENANT_URL} / ${SLOT_URL}${APPLY ? '' : '   [DRY RUN -- pass --apply to write]'}`);
  const tenant = await fetch(`${TENANT_URL}/tenants/by-subdomain/${SUBDOMAIN}`).then((r) => (r.ok ? r.json() : null));
  const t = tenant?.data ?? tenant;
  if (!t?.id) throw new Error(`tenant ${SUBDOMAIN} not found`);
  console.log(`tenant ${t.id}  name=${JSON.stringify(t.name)}  appName=${JSON.stringify(t.appName)}  (neither is changed)`);

  const before = await snapshot(t.id);
  show('BEFORE', before);

  // Resolve every target up front; abort before any write if anything is unexpected.
  const plan = [];
  for (const m of MAP) {
    const hits = before.filter((s) => s.branch === m.oldName || s.branch === m.newName);
    if (hits.length !== 1) throw new Error(`expected exactly one branch named ${JSON.stringify(m.oldName)} or ${JSON.stringify(m.newName)}, found ${hits.length}`);
    const s = hits[0];
    if (s.pools.length !== 1) throw new Error(`branch ${s.branchId} has ${s.pools.length} pools, expected exactly 1`);
    plan.push({ ...m, branchId: s.branchId, poolId: s.pools[0].poolId, curBranch: s.branch, curPool: s.pools[0].pool });
  }
  const clash = before.filter((s) => !plan.some((p) => p.branchId === s.branchId));
  if (clash.length) console.log(`\nnote: ${clash.length} other branch(es) in this tenant are untouched: ${clash.map((c) => JSON.stringify(c.branch)).join(', ')}`);

  console.log('\nPLAN');
  for (const p of plan) {
    console.log(`  branch ${p.branchId}: ${JSON.stringify(p.curBranch)} -> ${JSON.stringify(p.newName)}${p.curBranch === p.newName ? '  (already done)' : ''}`);
    console.log(`  pool   ${p.poolId}: ${JSON.stringify(p.curPool)} -> ${JSON.stringify(p.newPool)}${p.curPool === p.newPool ? '  (already done)' : ''}`);
  }
  if (!APPLY) { console.log('\nDry run: nothing written.'); return; }

  for (const p of plan) {
    if (p.curBranch !== p.newName) await call(TENANT_URL, 'PATCH', `/branches/${p.branchId}`, { name: p.newName });
    if (p.curPool !== p.newPool) await call(SLOT_URL, 'PATCH', `/resource-pools/${p.poolId}`, { name: p.newPool });
  }
  const after = await snapshot(t.id);
  show('AFTER (read back from the live services)', after);
  for (const p of plan) {
    const s = after.find((x) => x.branchId === p.branchId);
    if (s?.branch !== p.newName || s.pools[0]?.pool !== p.newPool) throw new Error(`read-back mismatch for branch ${p.branchId}`);
  }
  console.log('\nRead-back OK. Also confirm directly in SQL: SELECT id,name FROM "Branch" WHERE "tenantId"=<tenant>; SELECT id,name FROM "ResourcePool" WHERE "tenantId"=<tenant>;');
}
if (import.meta.url === pathToFileURL(argv[1]).href) {
  if (argv.includes('--self-test')) selfTest();
  else main().catch((e) => { console.error(`\nrename-jbc-venues failed: ${e.message}`); process.exitCode = e.message.includes('rejected:') || e.message.includes('INTERNAL_SERVICE_KEY') ? 2 : 1; });
}
