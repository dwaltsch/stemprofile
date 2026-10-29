/**
 * Robustness Test Suite
 *
 * Hostile and broken inputs (crafted share links, malformed route files,
 * corrupted storage) must load safely or fail with a clear error: no crash,
 * no NaN in rendered output, and bounded work.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { renderProfileSVG } from '../js/renderer.js';
import { generatePrintSheetMarkup, MAX_PRINT_CELLS } from '../js/export.js';
import { buildSpatialBlocks, MAX_SPATIAL_BLOCKS } from '../js/signal.js';
import { clampSettings, SETTING_LIMITS, compressPayload, deserializeHashToState } from '../js/share.js';

/** Encodes a legacy JSON share payload into a #stage= hash. */
async function legacyLink(payload) {
  return '#stage=' + await compressPayload(new TextEncoder().encode(JSON.stringify(payload)));
}

const routeCoords = Array.from({ length: 2000 }, (_, i) => [45 + i * 0.001, 6, 500 + 300 * Math.sin(i / 100)]);

describe('Robustness: Setting Limits', () => {
  it('clamps numeric settings to the UI ranges', () => {
    const out = clampSettings({ widthMm: 1e6, heightMm: -5, radiusMm: 99, smoothingWindow: 1e5, printCopies: 20000, blockSizeM: 1 });
    assert.equal(out.widthMm, SETTING_LIMITS.widthMm[1]);
    assert.equal(out.heightMm, SETTING_LIMITS.heightMm[0]);
    assert.equal(out.radiusMm, SETTING_LIMITS.radiusMm[1]);
    assert.equal(out.smoothingWindow, SETTING_LIMITS.smoothingWindow[1]);
    assert.equal(out.printCopies, SETTING_LIMITS.printCopies[1]);
    assert.equal(out.blockSizeM, SETTING_LIMITS.blockSizeM[0]);
  });

  it('keeps continuous mode, parses numeric strings, drops non-finite values', () => {
    const out = clampSettings({ blockSizeM: 0, widthMm: '120', heightMm: NaN, theme: 'dark' });
    assert.equal(out.blockSizeM, 0);
    assert.equal(out.widthMm, 120);
    assert.equal('heightMm' in out, false);
    assert.equal(out.theme, 'dark');
  });

  it('clamps values typed into the UI via store.updateSettings', () => {
    const store = createStore();
    store.updateSettings({ printCopies: 1e6, widthMm: 5 });
    assert.equal(store.getState().settings.printCopies, 16);
    assert.equal(store.getState().settings.widthMm, 20);
  });

  for (const [name, s] of [
    ['printCopies: 20000', { printCopies: 20000 }],
    ['blockSizeM: 1', { blockSizeM: 1 }],
    ['widthMm: 100000', { widthMm: 100000 }],
    ['smoothingWindow: 100000', { smoothingWindow: 100000 }]
  ]) {
    it(`a shared link with ${name} loads and renders a bounded sticker and sheet`, async () => {
      const payload = await deserializeHashToState(await legacyLink({ t: 'x', coords: routeCoords, s }));
      const store = createStore();
      assert.equal(store.loadPayload(payload), true);
      const state = store.getState();
      const svg = renderProfileSVG(state);
      const sheet = generatePrintSheetMarkup(state);
      assert.ok(state.blocks.length <= MAX_SPATIAL_BLOCKS);
      assert.ok(svg.length < 2e6, `profile SVG ${svg.length} chars`);
      assert.ok(sheet.count <= 16);
      assert.ok(!/NaN/.test(svg));
    });
  }
});

describe('Robustness: Render Hard Caps', () => {
  it('never builds more than MAX_SPATIAL_BLOCKS columns', () => {
    const points = Array.from({ length: 1000 }, (_, i) => ({ dist: i * 200, smoothEle: 100 + i }));
    const blocks = buildSpatialBlocks(points, 199800, 1);
    assert.ok(blocks.length <= MAX_SPATIAL_BLOCKS);
    assert.ok(Math.abs(blocks[blocks.length - 1].endDist - 199800) < 1e-6, 'blocks still cover the route');
  });

  it('never builds more than MAX_PRINT_CELLS print cells', () => {
    const store = createStore();
    store.setTrack({ title: 'x', coords: routeCoords });
    assert.equal(generatePrintSheetMarkup(store.getState(), { copies: 100000 }).count, MAX_PRINT_CELLS);
  });
});
