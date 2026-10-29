/**
 * StemProfile Standalone Test Runner
 *
 * Runs every test suite in one process (shared globals), which catches
 * suites that leak global state into each other.
 * Usage:
 *   node --test        (each suite in its own process)
 *   node test/run.js   (all suites in this process)
 *
 * `node --test` also picks up this file as a test file. In that case
 * NODE_TEST_CONTEXT is set and this file does nothing, otherwise every
 * suite would run twice.
 */

const SUITES = [
  './units.test.js',
  './layout.test.js',
  './store.test.js',
  './signal.test.js',
  './share.test.js',
  './parser.test.js',
  './renderer.test.js',
  './fueling.test.js',
  './export.test.js',
  './app.test.js',
  './escape.test.js',
  './share-compat.test.js',
  './ui-modules.test.js',
  './pacing.test.js',
  './history.test.js',
  './climb-detail.test.js',
  './robustness.test.js',
  './assets.test.js'
];

if (!process.env.NODE_TEST_CONTEXT) {
  for (const suite of SUITES) {
    await import(suite);
  }
}
