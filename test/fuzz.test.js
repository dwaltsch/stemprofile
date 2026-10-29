/**
 * Fuzz Test Suite
 *
 * Mutates valid GPX, TCX, FIT files and v3 share links with a seeded PRNG and
 * runs every mutant through parsing, the store and all renderers. Each input
 * must either be rejected with an Error or load into stickers with bounded
 * output and no NaN / Infinity, within a time budget.
 *
 * Reproduce or extend locally:
 *   FUZZ_SEED=123 FUZZ_ITERATIONS=5000 node --test test/fuzz.test.js   (or: just fuzz 5000)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { deserializeBinaryState } from '../js/share.js';
import {
  prng, mutateBytes, mutateText, checkInput, loadFile,
  SEED_GPX, SEED_TCX, SEED_FIT, SEED_V3
} from './helpers/fuzz-harness.js';

const SEED = Number(process.env.FUZZ_SEED || 20261029);
const ITERATIONS = Number(process.env.FUZZ_ITERATIONS || 250);

describe(`Fuzz (seed ${SEED}, ${ITERATIONS} mutants per format)`, () => {
  it('seed inputs are valid and load', () => {
    assert.equal(checkInput(loadFile(SEED_GPX, 'seed.gpx'), 'seed GPX'), 'loaded');
    assert.equal(checkInput(loadFile(SEED_TCX, 'seed.tcx'), 'seed TCX'), 'loaded');
    assert.equal(checkInput(loadFile(SEED_FIT.buffer, 'seed.fit'), 'seed FIT'), 'loaded');
    assert.ok(createStore().loadPayload(deserializeBinaryState(SEED_V3)));
  });

  const formats = [
    ['GPX', i => mutateText(SEED_GPX, prng(SEED + i)), m => loadFile(m, 'fuzz.gpx')],
    ['TCX', i => mutateText(SEED_TCX, prng(SEED * 3 + i)), m => loadFile(m, 'fuzz.tcx')],
    ['FIT', i => mutateBytes(SEED_FIT, prng(SEED * 7 + i)), m => loadFile(m.slice().buffer, 'fuzz.fit')],
    ['v3 link', i => mutateBytes(SEED_V3, prng(SEED * 11 + i)), m => () => {
      const store = createStore();
      return store.loadPayload(deserializeBinaryState(m)) ? store : null;
    }]
  ];

  for (const [name, mutate, loader] of formats) {
    it(`${name}: mutants are rejected cleanly or render without NaN`, () => {
      const tally = { rejected: 0, loaded: 0 };
      for (let i = 0; i < ITERATIONS; i++) {
        const mutant = mutate(i);
        tally[checkInput(loader(mutant), `${name} mutant #${i} (FUZZ_SEED=${SEED})`)]++;
      }
      // Mutations must exercise both paths, otherwise the fuzzer is not testing anything useful
      assert.ok(tally.loaded > 0 && tally.rejected > 0, `${name}: ${JSON.stringify(tally)}`);
    });
  }
});
