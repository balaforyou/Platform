/**
 * Post-build: inject the real push/notificationclick handler (scripts/shared-sw-push-handler.js,
 * the single source of truth -- see that file's own header) into a built `dist/sw.js`, replacing
 * the `__PUSH_NOTIFICATION_HANDLER__` marker each app's own `public/sw.js` carries instead of
 * the real (previously duplicated) code. Vite copies `public/sw.js` to `dist/` verbatim -- no
 * transform pass reaches it -- so this rewrites the emitted file in place, mirroring
 * apps/admin-v2/scripts/stamp-sw.mjs's own `__BUILD_SHA__` substitution pattern exactly.
 *
 * Usage: node scripts/inject-push-sw-handler.mjs --dist <path> --title <fallback title> --icon <icon path>
 * Run from the app's own package.json build script (cwd = that app's directory), same as
 * stamp-sw.mjs already is for admin-v2.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

const { dist, title, icon } = parseArgs(process.argv.slice(2));

if (!dist || !title || !icon) {
  console.error('inject-push-sw-handler: usage: --dist <path> --title <fallback title> --icon <icon path>');
  process.exit(1);
}

const distPath = resolve(process.cwd(), dist);
const fragmentPath = resolve(__dirname, 'shared-sw-push-handler.js');

if (!existsSync(distPath)) {
  console.error(`inject-push-sw-handler: ${distPath} not found — did vite build run?`);
  process.exit(1);
}
if (!existsSync(fragmentPath)) {
  console.error(`inject-push-sw-handler: ${fragmentPath} not found`);
  process.exit(1);
}

const target = readFileSync(distPath, 'utf8');
const MARKER = '/* __PUSH_NOTIFICATION_HANDLER__ */';
if (!target.includes(MARKER)) {
  console.error(`inject-push-sw-handler: no ${MARKER} placeholder in ${distPath}`);
  process.exit(1);
}

const fragmentSource = readFileSync(fragmentPath, 'utf8');
const CODE_START = '/* __SHARED_SW_PUSH_HANDLER_CODE_START__ */';
const codeStartIndex = fragmentSource.indexOf(CODE_START);
if (codeStartIndex === -1) {
  console.error(`inject-push-sw-handler: no ${CODE_START} marker in ${fragmentPath}`);
  process.exit(1);
}
// Only the code after the marker is injected -- the header above it documents the placeholder
// tokens as prose, and doing a blind global replace across the whole file (header included)
// would mangle that prose too, since it literally names the tokens being substituted.
const fragment = fragmentSource
  .slice(codeStartIndex + CODE_START.length)
  .replace(/__PUSH_FALLBACK_TITLE__/g, title)
  .replace(/__PUSH_ICON_PATH__/g, icon)
  .trim();

writeFileSync(distPath, target.replace(MARKER, fragment));
console.log(`inject-push-sw-handler: ${dist} <- shared-sw-push-handler.js (title="${title}", icon="${icon}")`);
