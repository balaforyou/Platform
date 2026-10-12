// Throwaway Spike harness (NOT product code, NOT in the repo). Talks to the five REAL built
// services over HTTP; touches the scratch database directly only to seed fixtures and for
// read-back SQL (same practice as the regression suites' fixtures).
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import crypto from 'crypto';

const require = createRequire('/home/user/Platform/services/slot-engine/package.json');
export const { PrismaClient } = require('@badminton/database');
const harness = require('@badminton/test-harness');
export const { signJwt } = harness;

export const DB_NAME = 'badminton_db_scratch_spike';
if (!/scratch/.test(DB_NAME)) throw new Error('refusing: not a scratch db');
export const DB_URL = `postgresql://postgres@127.0.0.1:65500/${DB_NAME}?schema=public`;
process.env.DATABASE_URL = DB_URL;
export const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

export const SE = 'http://localhost:3001';
export const PAY = 'http://localhost:3004';
export const KEY = 'test-service-key';

export const TENANT = '11111111-1111-1111-1111-1111111111aa';
export const BRANCH = '22222222-2222-2222-2222-2222222222aa';
export const ownerTok = () => signJwt({ userId: 'owner-user', tenantId: TENANT, roles: ['owner'], userType: 'MEMBER' });
export const managerTok = () => signJwt({ userId: 'manager-user', tenantId: TENANT, roles: [`branch_manager:${BRANCH}`], userType: 'MEMBER' });
export const memberTok = (userId) => signJwt({ userId, tenantId: TENANT, roles: [], userType: 'MEMBER' });
export const guestTok = (userId) => signJwt({ userId, tenantId: TENANT, roles: [], userType: 'GUEST' });

export const out = [];
export function log(line = '') { out.push(line); console.log(line); }
export function h(title) { log(''); log('='.repeat(100)); log(title); log('='.repeat(100)); }

/** Real HTTP call; logs the exact request and the exact response. */
export async function http(label, method, url, { token, body, headers = {}, quiet = false } = {}) {
  const hdrs = { 'Content-Type': 'application/json', ...headers };
  if (token) hdrs.Authorization = token === 'INTERNAL' ? `Bearer ${KEY}` : `Bearer ${token}`;
  const who = token === 'INTERNAL' ? 'internal-key' : token ? `jwt(${decodeRole(token)})` : 'no-auth';
  log(`--- ${label}`);
  log(`REQUEST  ${method} ${url}  [${who}]${headers['Idempotency-Key'] ? ' idem=' + headers['Idempotency-Key'] : ''}`);
  if (body !== undefined) log(`  body: ${JSON.stringify(body)}`);
  const res = await fetch(url, { method, headers: hdrs, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  if (!quiet) log(`RESPONSE ${res.status}  ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  else log(`RESPONSE ${res.status}  (body suppressed, ${text.length} bytes)`);
  return { status: res.status, json, data: json && json.data !== undefined ? json.data : json };
}
function decodeRole(token) {
  try { const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); return `${p.userType}:${(p.roles || []).join('|') || 'no-roles'}:${p.userId}`; } catch { return '?'; }
}

/** Real SQL read-back via psql: prints the statement and psql's raw output. */
export function sql(label, statement) {
  log(`--- SQL read-back: ${label}`);
  log(`SQL      ${statement.trim().replace(/\s+/g, ' ')}`);
  const r = spawnSync('/usr/lib/postgresql/16/bin/psql', ['-h', '127.0.0.1', '-p', '65500', '-U', 'postgres', '-d', DB_NAME, '-X', '-P', 'pager=off', '-c', statement], { encoding: 'utf8' });
  log((r.stdout || '') + (r.stderr || ''));
}

export async function resetDb() {
  const r = spawnSync('/usr/lib/postgresql/16/bin/psql', ['-h', '127.0.0.1', '-p', '65500', '-U', 'postgres', '-d', DB_NAME, '-X', '-At', '-c',
    `SELECT string_agg(format('%I', tablename), ',') FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`], { encoding: 'utf8' });
  const tables = r.stdout.trim();
  spawnSync('/usr/lib/postgresql/16/bin/psql', ['-h', '127.0.0.1', '-p', '65500', '-U', 'postgres', '-d', DB_NAME, '-X', '-c', `TRUNCATE ${tables} RESTART IDENTITY CASCADE`], { encoding: 'utf8' });
}

/** Branch tz = UTC. POOLED pool, `courts` named courts, capacity = courts, grace 60 (JBC's value). */
export async function baseFixture({ courts = 4, poolName = 'Pool A' } = {}) {
  await resetDb();
  await db.tenant.create({ data: { id: TENANT, name: 'Spike Tenant', subdomain: 'spike', memberPeakDefaultRate: 100, memberNonPeakDefaultRate: 100 } });
  await db.branch.create({ data: { id: BRANCH, tenantId: TENANT, name: 'Spike Branch', status: 'ACTIVE', timezone: 'UTC' } });
  for (const module of ['GUEST_BOOKING', 'MEMBER_MANAGEMENT']) {
    await db.moduleEntitlement.create({ data: { tenantId: TENANT, module, startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01') } });
  }
  const pool = await db.resourcePool.create({ data: {
    tenantId: TENANT, branchId: BRANCH, name: poolName, allocationMode: 'POOLED', capacity: courts, minOccupancy: 1,
    minBookingDurationMinutes: 60, pricingMode: 'FLAT', defaultRate: 100,
  } });
  await db.bookingRule.create({ data: { resourcePoolId: pool.id, gracePeriodMinutes: 60, guestAccessCutoffMinutes: 120, cancellationPolicyJson: { type: 'tiered', tiers: [{ hoursBeforeStart: 0, refundPercentage: 100 }] } } });
  const y = new Date(); y.setUTCDate(y.getUTCDate() - 1); y.setUTCHours(0, 0, 0, 0);
  const e = new Date(y); e.setUTCFullYear(e.getUTCFullYear() + 1);
  await db.availabilityPattern.create({ data: { resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '06:00', endTime: '22:00', slotDurationMinutes: 60, capacity: courts, status: 'ACTIVE', startDate: y, endDate: e } });
  const resources = [];
  for (let i = 1; i <= courts; i++) {
    resources.push(await db.resource.create({ data: { resourcePoolId: pool.id, name: `Court ${i}`, guestBookable: true } }));
  }
  return { pool, resources };
}

export const hhmm = (d) => d.toISOString().slice(11, 16);
export const isoWeekday = (d) => String(d.getUTCDay() === 0 ? 7 : d.getUTCDay());
export function alignedHour(hoursAhead) {
  const d = new Date(Date.now() + hoursAhead * 3600e3); d.setUTCMinutes(0, 0, 0); return d;
}
export async function makeWindow(poolId, start, capacity) {
  // Lazy generation (as in production): GET availability for that date makes the slot-engine generate the pattern's windows.
  const date = start.toISOString().slice(0, 10);
  await fetch(`${SE}/resource-pools/${poolId}/availability?date=${date}`);
  const gen = await db.availabilityWindow.findFirst({ where: { resourcePoolId: poolId, startTime: start } });
  if (gen) return gen;
  return db.availabilityWindow.create({ data: { resourcePoolId: poolId, resourceId: null, startTime: start, endTime: new Date(start.getTime() + 3600e3), capacity } });
}
export async function makeSubscription(userId) {
  return db.subscription.create({ data: { userId, tenantId: TENANT, mandateId: `mandate-${userId}-${crypto.randomUUID().slice(0, 6)}`, amount: 100000, frequency: 'monthly', status: 'active' } });
}
export async function makeUser(id, name, phone, userType = 'GUEST') {
  return db.user.create({ data: { id, tenantId: TENANT, name, phone, userType, isPhoneVerified: true } });
}
export function writeOut() { return out.join('\n') + '\n'; }
