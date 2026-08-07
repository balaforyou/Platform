export interface Section<TContext = void> {
  /** Displayed verbatim in the PASS/FAIL report — keep it specific. */
  name: string;
  run: (context: TContext) => Promise<void>;
}

export interface SectionResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: Error;
}

/**
 * Runs sections sequentially and reports PASS/FAIL + duration for each.
 * This is the entire "test runner" — see the note in index.ts for why no
 * framework is used here.
 *
 * Continues past a failing section rather than aborting, so one broken section
 * doesn't hide the state of every section after it. Sections share mutable DB
 * state by design, so failures after the first may be cascading — the report
 * says so explicitly rather than pretending each result is independent.
 *
 * Returns the results; the caller decides the process exit code.
 */
export async function runSections<TContext>(
  suiteName: string,
  sections: Section<TContext>[],
  context: TContext,
): Promise<SectionResult[]> {
  const results: SectionResult[] = [];

  console.log(`\n${'='.repeat(72)}`);
  console.log(`REGRESSION SUITE: ${suiteName}`);
  console.log('='.repeat(72));

  for (const section of sections) {
    const startedAt = Date.now();
    console.log(`\n--- ${section.name} ---`);
    try {
      await section.run(context);
      const durationMs = Date.now() - startedAt;
      results.push({ name: section.name, passed: true, durationMs });
      console.log(`    PASS  ${section.name} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;
      results.push({ name: section.name, passed: false, durationMs, error: err });
      console.log(`    FAIL  ${section.name} (${durationMs}ms)`);
      console.log(`          ${err?.message ?? err}`);
      if (err?.stack) console.log(String(err.stack).split('\n').slice(1, 4).join('\n'));
    }
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${'-'.repeat(72)}`);
  console.log(`${suiteName} summary:`);
  for (const result of results) {
    console.log(`  ${result.passed ? 'PASS' : 'FAIL'}  ${result.name}  (${result.durationMs}ms)`);
  }
  console.log(
    `  ${results.length - failed.length}/${results.length} sections passed` +
      (failed.length > 1 ? '  (note: sections share DB state — later failures may be cascading)' : ''),
  );
  console.log('-'.repeat(72));

  return results;
}

/** True if every section passed — intended for `process.exitCode` decisions. */
export function allPassed(results: SectionResult[]): boolean {
  return results.every((r) => r.passed);
}

/**
 * Minimal assertion used throughout the regression suites.
 * Kept deliberately plain (throw on false) to match the pre-existing style.
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${String(expected)}, got ${String(actual)})`);
  }
}
