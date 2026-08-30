/**
 * Post-build: bake the build SHA into dist/sw.js so the runtime cache name is
 * `admin-v2-shell-<sha>` (§7). Vite copies public/sw.js to dist/ verbatim — no
 * transform pass reaches it — so this rewrites the emitted file in place.
 *
 * SHA source, in order: GIT_SHA env (set by the Docker build, matching the
 * Dockerfile.caddy-static GIT_SHA ARG) -> `git rev-parse --short HEAD` -> "dev".
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const SW_PATH = resolve(process.cwd(), 'dist/sw.js');

function resolveSha() {
  if (process.env.GIT_SHA && process.env.GIT_SHA !== 'unknown') return process.env.GIT_SHA;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

if (!existsSync(SW_PATH)) {
  console.error(`stamp-sw: ${SW_PATH} not found — did vite build run?`);
  process.exit(1);
}

const sha = resolveSha();
const src = readFileSync(SW_PATH, 'utf8');
if (!src.includes('__BUILD_SHA__')) {
  console.error('stamp-sw: no __BUILD_SHA__ placeholder in dist/sw.js');
  process.exit(1);
}
writeFileSync(SW_PATH, src.replace(/__BUILD_SHA__/g, sha));
console.log(`stamp-sw: dist/sw.js cache -> admin-v2-shell-${sha}`);
