/**
 * F-101: refuse to wipe a database that is not disposable.
 *
 * WHY THIS EXISTS. Every regression suite calls a `cleanDatabase()` that issues unscoped
 * `deleteMany()` across the schema — tenant, branch, user, booking, resourcePool and the rest,
 * with no WHERE clause and nothing tying the deletions to test fixtures. All five services do
 * it, so `pnpm test:regression` is five consecutive full-database wipes.
 *
 * That was survivable while the database held only seed data. It stopped being survivable the
 * moment a real provisioned customer tenant lived there: during the session that found this,
 * `pnpm test:regression:tenant` destroyed a fully provisioned JBC demo — tenant, both branches,
 * both pools, every resource, rule and pattern — plus the pre-existing courtowner1 tenant, in
 * one command, with no warning and no sign afterwards that anything had happened.
 *
 * The guard is deliberately fail-closed. An unrecognised database is refused rather than
 * wiped, because the cost of a false refusal is one environment variable and the cost of a
 * false permit is somebody's provisioned data.
 */

/**
 * Database names that are disposable by construction.
 *
 * `e2e` was added when `badminton_db_e2e` was created (F-047): the Playwright suite needed a
 * database of its own, because the regression suites wipe and reseed `_test` and collide with the
 * specs over shared fixture rows (F-046). It belongs on this list for the same reason every other
 * entry does — the name advertises that the contents are disposable — and was absent only because
 * no e2e-specific database existed until then.
 */
const DISPOSABLE_NAME = /(^|[_-])(test|tests|testing|e2e|ci|shadow|scratch|throwaway)([_-]|$)/i;

/** Explicit opt-in for a database whose name does not advertise that it is disposable. */
const OVERRIDE_ENV = 'ALLOW_DESTRUCTIVE_DB_RESET';

/** Extracts the database name from a Postgres connection URL, without leaking credentials. */
export function databaseNameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // The URL parser handles credentials, ports and query strings for us; the pathname is
    // "/<dbname>". Parsing beats a regex here because passwords routinely contain '/' and '@'.
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Throws unless the configured database is safe to destroy.
 *
 * Call this at the top of any helper that deletes without a WHERE clause. It reports the
 * database name — never the URL, which carries the password — so a refusal is actionable
 * without putting a credential into CI logs or a terminal someone screenshots.
 */
export function assertDisposableDatabase(context = 'destructive test reset'): string {
  const url = process.env.DATABASE_URL;
  const name = databaseNameFromUrl(url);

  if (!name) {
    throw new Error(
      `F-101 guard: refusing ${context} — DATABASE_URL is unset or unparseable, so the target ` +
      `database cannot be identified. Set DATABASE_URL to a disposable database before running ` +
      `a suite that wipes the schema.`,
    );
  }

  if (DISPOSABLE_NAME.test(name)) return name;

  if (String(process.env[OVERRIDE_ENV]).toLowerCase() === 'true') {
    console.warn(
      `F-101 guard: ${context} permitted on non-disposable database "${name}" because ` +
      `${OVERRIDE_ENV}=true. Everything in it is about to be deleted.`,
    );
    return name;
  }

  throw new Error(
    `F-101 guard: refusing ${context} on database "${name}".\n` +
    `\n` +
    `  This helper deletes every row in the schema with no WHERE clause. Running it against a\n` +
    `  database holding provisioned tenants, branches or bookings destroys them irrecoverably —\n` +
    `  which is exactly what happened to a real customer demo on 15 Aug 2026.\n` +
    `\n` +
    `  Point DATABASE_URL at a disposable database (a name containing "test", "e2e", "ci",\n` +
    `  "shadow" or "scratch" is accepted automatically), or, if you genuinely mean to wipe\n` +
    `  "${name}", re-run with ${OVERRIDE_ENV}=true.\n`,
  );
}
