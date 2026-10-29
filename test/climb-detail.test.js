/**
 * Climb Detail Mode Test Suite
 *
 * Tests per-climb segmentation, the climb detail sticker renderer, stacked
 * export, print sheet integration, and the store toggle.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import {
  getDetailClimbs,
  chooseDetailBlockSize,
  buildClimbBlocks,
  renderClimbDetailSVG,
  renderClimbDetailStackSVG
} from '../js/renderer/climb-detail.js';
import { generatePrintSheetMarkup } from '../js/export.js';
import { renderActiveSticker } from '../js/export/download.js';

function hillyStore() {
  const coords = [];
  for (let i = 0; i <= 600; i++) {
    const d = i * 0.0009;
    coords.push({ lat: 45 + d, lon: 6 + d / 2, ele: 400 + 900 * Math.max(0, Math.sin(i / 70)) + 300 * Math.max(0, Math.sin(i / 23)) });
  }
  const store = createStore();
  store.setTrack({ title: 'Climb Route', coords });
  return store;
}

describe('Climb Detail: Segmentation', () => {
  it('chooses 8-20 segments for typical climb lengths', () => {
    assert.equal(chooseDetailBlockSize(1800), 100);
    assert.equal(chooseDetailBlockSize(4000), 200);
    assert.equal(chooseDetailBlockSize(4500), 250);
    assert.equal(chooseDetailBlockSize(9000), 500);
    assert.equal(chooseDetailBlockSize(14000), 1000);
    assert.equal(chooseDetailBlockSize(30000), 2000);
  });

  it('covers the whole climb from foot to summit', () => {
    const state = hillyStore().getState();
    for (const climb of state.climbs) {
      const { blocks, lengthM } = buildClimbBlocks(state.points, climb);
      const covered = blocks.reduce((acc, b) => acc + b.lengthM, 0);
      assert.ok(Math.abs(covered - lengthM) < 0.01, `climb ${climb.id} covered ${covered} of ${lengthM}`);
      assert.ok(blocks.length <= 20);
      assert.ok(Math.abs(blocks[blocks.length - 1].endEle - climb.summitEle) < 1.5, `climb ${climb.id} ends at summit`);
    }
  });

  it('only details climbs that are enabled and not hidden', () => {
    const store = hillyStore();
    const total = store.getState().climbs.length;
    assert.ok(total >= 2, 'fixture route should contain several climbs');
    store.toggleClimbVisibility(store.getState().climbs[0].id);
    assert.equal(getDetailClimbs(store.getState()).length, total - 1);
  });
});

describe('Climb Detail: Rendering', () => {
  it('renders a sticker at the elevation sticker size with header stats', () => {
    const state = hillyStore().getState();
    const climb = state.climbs[0];
    const svg = renderClimbDetailSVG(state, climb);
    assert.ok(svg.startsWith('<svg class="climb-detail-svg"'));
    assert.ok(svg.includes(`width="${state.settings.widthMm}mm"`));
    assert.ok(svg.includes(`height="${state.settings.heightMm}mm"`));
    assert.ok(svg.includes(climb.category.toUpperCase()));
    assert.ok(svg.includes(`${climb.summitEle} m`), 'summit elevation label');
    assert.match(svg, /~\d+ min/, 'estimated climbing time from pacing');
  });

  it('names climbs after a nearby summit waypoint and escapes the label', () => {
    const store = hillyStore();
    const climb = store.getState().climbs[0];
    store.addWaypoint(climb.summitKm * 1000 + 200, 'summit', 'Col <du> "Test"');
    const svg = renderClimbDetailSVG(store.getState(), climb);
    assert.ok(svg.includes('Col &lt;du&gt; &quot;Test&quot;'));
    assert.ok(!svg.includes('<du>'));
  });

  it('falls back to a numbered name', () => {
    const state = hillyStore().getState();
    assert.ok(renderClimbDetailSVG(state, state.climbs[1], { index: 1 }).includes('Climb 2'));
  });

  it('stacks all detail climbs for export', () => {
    const state = hillyStore().getState();
    const n = getDetailClimbs(state).length;
    const stack = renderClimbDetailStackSVG(state);
    assert.equal(stack.count, n);
    assert.equal(stack.heightMm, n * state.settings.heightMm + (n - 1) * 4);
    assert.equal((stack.svg.match(/class="climb-detail-card"/g) || []).length, n);
  });
});

describe('Climb Detail: Mode, Export & Print', () => {
  it('toggles via the store without creating an undo step', () => {
    const store = hillyStore();
    store.setClimbDetail(true);
    assert.equal(store.getState().climbDetail, true);
    assert.equal(store.canUndo(), false);
  });

  it('exports the climb stack only while climb detail is on', () => {
    const store = hillyStore();
    const state = store.getState();
    assert.ok(renderActiveSticker(state, 'white').svg.includes('profile-svg-elem'));
    store.setClimbDetail(true);
    const active = renderActiveSticker(store.getState(), 'white');
    assert.ok(active.svg.startsWith('<svg class="climb-detail-stack"'));
    assert.ok(active.baseName.endsWith('_climbs'));
  });

  it('prints each detail climb `copies` times in climb mode or with the Climbs sticker type', () => {
    const store = hillyStore();
    const n = getDetailClimbs(store.getState()).length;

    const profileSheet = generatePrintSheetMarkup(store.getState(), { copies: 2 });
    assert.equal(profileSheet.count, 2);

    const climbsType = generatePrintSheetMarkup(store.getState(), { copies: 2, stickerType: 'climbs' });
    assert.equal(climbsType.count, n * 2);
    assert.equal((climbsType.html.match(/class="climb-detail-svg"/g) || []).length, n * 2);

    store.setClimbDetail(true);
    const activeSheet = generatePrintSheetMarkup(store.getState(), { copies: 1 });
    assert.equal(activeSheet.count, n);
  });

  it('falls back to the profile when a route has no climbs', () => {
    const coords = [];
    for (let i = 0; i <= 100; i++) coords.push({ lat: 45 + i * 0.001, lon: 6, ele: 100 });
    const store = createStore();
    store.setTrack({ title: 'Flat', coords });
    store.setClimbDetail(true);
    assert.ok(renderActiveSticker(store.getState(), 'white').svg.includes('profile-svg-elem'));
    assert.equal(generatePrintSheetMarkup(store.getState(), { copies: 2 }).count, 2);
  });
});
