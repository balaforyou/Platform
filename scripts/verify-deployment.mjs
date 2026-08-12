#!/usr/bin/env node
/**
 * F-077: prove a deploy is complete, per component.
 *
 * On 9 Aug 2026 one deploy left three components at three different vintages — services
 * current, the migrate image three migrations behind, the frontend bundle behind by a
 * whole feature — and no single check revealed it. The 401 smoke tests only proved the
 * services. The schema gap only surfaced as a runtime 42P10. The stale frontend was
 * noticed by eye, because an absent nav item was the only symptom it produced.
 *
 * Every component reports the SHA it was built from. This compares all of them against
 * the SHA the deploy intended to ship, and names whichever is behind.
 *
 * HTTP-only by design: no database credentials, so it runs from anywhere.
 *
 *   node scripts/verify-deployment.mjs <baseUrl> <expectedSha>
 */

const [, , baseUrl, expectedSha] = process.argv;

if (!baseUrl || !expectedSha) {
  console.error('Usage: node scripts/verify-deployment.mjs <baseUrl> <expectedSha>');
  console.error('   eg: node scripts/verify-deployment.mjs https://elitecourts.duckdns.org $(cat BUILD_SHA)');
  process.exit(2);
}

const base = baseUrl.replace(/\/+$/, '');

// Caddy's API path prefixes, per deploy/gcp-vm/Caddyfile.
const SERVICES = [
  ['slot-engine', '/api/slot-engine/health'],
  ['identity-auth', '/api/identity/health'],
  ['tenant-management', '/api/tenant/health'],
  ['payment', '/api/payment/health'],
  ['notification', '/api/notification/health'],
];

// Static bundles have no /health, so each carries a version.json emitted at build time.
const FRONTENDS = [
  ['guest-pwa', '/version.json'],
  ['admin-web', '/admin/version.json'],
];

// WHY: an explicit controller with clearTimeout rather than AbortSignal.timeout(). The
// latter leaves a live timer handle, and exiting through process.exit() while it is still
// pending crashed libuv on Windows with an UV_HANDLE_CLOSING assertion — the script
// printed correct results, then died with exit 127 instead of 1. A deploy gate that
// crashes on exit, reporting a code conventionally meaning "command not found", is worse
// than no gate: it fails in a way nobody would diagnose as a stale deploy.
async function fetchJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, raw: text.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];

for (const [name, path] of SERVICES) {
  try {
    const { status, json, raw } = await fetchJson(path);
    // The envelope plugin wraps success responses in { data: ... }.
    const version = json?.data?.version ?? json?.version;
    results.push({
      name, path, status,
      version: version ?? '(absent)',
      ok: status === 200 && version === expectedSha,
      note: status !== 200 ? `HTTP ${status}: ${raw}` : version ? '' : 'no version field — image predates F-077',
    });
  } catch (e) {
    results.push({ name, path, status: 'ERR', version: '-', ok: false, note: e.message });
  }
}

for (const [name, path] of FRONTENDS) {
  try {
    const { status, json, raw } = await fetchJson(path);
    const sha = json?.sha;
    results.push({
      name, path, status,
      version: sha ?? '(absent)',
      ok: status === 200 && sha === expectedSha,
      note: status !== 200 ? `HTTP ${status}: ${raw}` : sha ? '' : 'no version.json — bundle predates F-077',
    });
  } catch (e) {
    results.push({ name, path, status: 'ERR', version: '-', ok: false, note: e.message });
  }
}

console.log(`\nDeployment verification — ${base}`);
console.log(`Expected SHA: ${expectedSha}\n`);
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${r.name.padEnd(20)} ${String(r.version).slice(0, 12).padEnd(14)} ${r.note}`);
}

const failed = results.filter((r) => !r.ok);
console.log('');

// WHY: process.exitCode rather than process.exit(). Exiting explicitly tore the event loop
// down while fetch handles were still settling and crashed libuv on Windows, turning a
// clean "deploy is stale" signal into exit 127. Setting the code lets the loop drain and
// exit on its own.
if (failed.length === 0) {
  console.log(`  All ${results.length} components report ${expectedSha.slice(0, 12)} — deploy is complete.\n`);
  process.exitCode = 0;
} else {
  // Naming the specific components is the point. A generic failure would not have
  // distinguished "the frontend is a feature behind" from "the whole deploy failed".
  console.log(`  ${failed.length}/${results.length} components are NOT at the deploy target: ${failed.map((f) => f.name).join(', ')}`);
  console.log('  Rebuild those images explicitly — Docker may be serving them from cache.\n');
  process.exitCode = 1;
}
