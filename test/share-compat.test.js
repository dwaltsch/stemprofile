/**
 * Share Link Backward-Compatibility Test Suite
 *
 * Decodes share links frozen in test/fixtures/ so that changes to the
 * serialization format cannot silently break links users already shared.
 * Never regenerate these fixtures; add a new one when the format changes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deserializeHashToState } from '../js/share.js';
import { createStore } from '../js/store.js';

function loadFixtureHash(name) {
  const url = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').trim();
  return new URL(url).hash;
}

describe('Share Compatibility: Legacy gzip JSON links', () => {
  it('decodes the frozen legacy link with full-resolution coordinates', async () => {
    const payload = await deserializeHashToState(loadFixtureHash('share-link-legacy-json.txt'));
    assert.ok(payload, 'legacy link failed to decode');
    assert.equal(payload.title, 'StemProfile');
    assert.equal(payload.coords.length, 450);
    assert.deepEqual(payload.coords[0], [45.10016, 6.00913, 712]);
    assert.deepEqual(payload.coords[449], [45.09468, 6.07086, 1842]);
    assert.equal(payload.settings.widthMm, 110);
    assert.equal(payload.settings.theme, 'white');
    assert.deepEqual(payload.waypoints, []);
  });

  it('loads into the store', async () => {
    const payload = await deserializeHashToState(loadFixtureHash('share-link-legacy-json.txt'));
    const store = createStore();
    assert.equal(store.loadPayload(payload), true);
    assert.ok(store.getState().stats.totalDist > 0);
  });
});

describe('Share Compatibility: Binary protocol v3 links', () => {
  it('decodes title, settings, hidden climbs and waypoints', async () => {
    const payload = await deserializeHashToState(loadFixtureHash('share-link-v3.txt'));
    assert.ok(payload, 'v3 link failed to decode');
    assert.equal(payload.title, 'Col Fixture · Étape 3');

    const s = payload.settings;
    assert.equal(s.theme, 'giro');
    assert.equal(s.units, 'imperial');
    assert.equal(s.widthMm, 100);
    assert.equal(s.heightMm, 28);
    assert.equal(s.blockSizeM, 500);
    assert.equal(s.smoothingWindow, 5);
    assert.equal(s.showHeader, false);
    assert.equal(s.showCutGuidelines, false);
    assert.equal(s.showBlockPct, true);
    assert.deepEqual(s.hiddenClimbIds, [2]);

    assert.deepEqual(payload.waypoints, [
      { id: 'wpt-sh-1', distM: 5000, type: 'feed', label: 'Feed Ü', enabled: true },
      { id: 'wpt-sh-2', distM: 12340, type: 'caution', label: 'Gravel', enabled: false }
    ]);
  });

  it('reconstructs the elevation profile endpoints', async () => {
    const payload = await deserializeHashToState(loadFixtureHash('share-link-v3.txt'));
    const first = payload.coords[0];
    const last = payload.coords[payload.coords.length - 1];
    assert.equal(first.dist, 0);
    assert.equal(first.ele, 500);
    assert.equal(last.dist, 20000);
    assert.ok(Math.abs(last.ele - 324.6) < 0.01);
  });

  it('loads into the store', async () => {
    const payload = await deserializeHashToState(loadFixtureHash('share-link-v3.txt'));
    const store = createStore();
    assert.equal(store.loadPayload(payload), true);
    const state = store.getState();
    assert.equal(state.settings.title, 'Col Fixture · Étape 3');
    assert.equal(state.waypoints.length, 2);
  });
});
