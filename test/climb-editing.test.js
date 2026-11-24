/**
 * Climb identity and editing: stable ids that survive re-detection, the
 * detection threshold, and manual climbs (merge / split by hand).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { adoptClimbIds, climbIdFor, sanitizeManualClimbs, measureClimb, processTrackSignal } from '../js/signal.js';
import { serializeBinaryState, deserializeBinaryState } from '../js/share.js';

/** Elevation (m) at distance d (m): two climbs split by a 40 m dip, then a small 50 m bump. */
function eleAt(d) {
  if (d < 2000) return 200;
  if (d < 6000) return 200 + (d - 2000) * 0.075;          // climb A: +300 m
  if (d < 6800) return 500 - (d - 6000) * 0.05;           // dip: -40 m
  if (d < 9800) return 460 + (d - 6800) * 0.07;           // climb B: +210 m
  if (d < 14000) return 670 - Math.min(470, (d - 9800) * 0.06);
  if (d < 15000) return 200 + (d - 14000) * 0.05;          // bump: +50 m
  return 250 - Math.min(50, (d - 15000) * 0.05);
}
const coords = Array.from({ length: 1001 }, (_, i) => ({ lat: 45 + (i * 20) / 111195, lon: 6, ele: eleAt(i * 20) }));

function loaded() {
  const s = createStore();
  s.setTrack({ title: 'Two climbs', coords });
  return s;
}

describe('Climbs: stable ids', () => {
  it('ids are the summit position in decametres', () => {
    const { climbs } = loaded().getState();
    assert.ok(climbs.length >= 2);
    for (const c of climbs) assert.equal(c.id, climbIdFor(c.summitKm * 1000));
  });

  it('a hidden climb stays hidden when another climb disappears and smoothing moves its summit', () => {
    const s = loaded();
    const before = s.getState().climbs;
    const target = before[before.length - 1];
    s.toggleClimbVisibility(target.id);
    s.updateSettings({ climbMinGainM: 100 }); // drops the small bump if it was detected
    s.updateSettings({ smoothingWindow: 21 }, true);
    const after = s.getState().climbs;
    const same = after.find(c => Math.abs(c.summitKm - target.summitKm) < 0.5);
    if (same) assert.ok(s.getState().settings.hiddenClimbIds.map(Number).includes(same.id), 'same climb keeps its hidden flag');
    for (const c of after) {
      if (c !== same) assert.ok(!s.getState().settings.hiddenClimbIds.map(Number).includes(c.id), `climb at ${c.summitKm} km is not hidden`);
    }
  });

  it('adoptClimbIds takes over the nearest referenced id within 500 m, once', () => {
    const climbs = [{ id: 1000 }, { id: 1030 }, { id: 2000 }, { id: 3000, manual: true }];
    adoptClimbIds(climbs, [1020, 2100, 2990]);
    assert.deepEqual(climbs.map(c => c.id), [1000, 1020, 2000, 3000]);
  });
});

describe('Climbs: detection threshold', () => {
  it('climbMinGainM drops climbs below the threshold and refreshes the stats', () => {
    const s = loaded();
    const all = s.getState().climbs.length;
    s.updateSettings({ climbMinGainM: 250 });
    const big = s.getState().climbs;
    assert.ok(big.length < all);
    assert.ok(big.every(c => c.gainM >= 250));
    assert.equal(s.getState().stats.climbsCount, big.length);
    s.undo();
    assert.equal(s.getState().climbs.length, all);
  });
});

describe('Climbs: manual climbs', () => {
  it('a manual climb spanning two detected climbs merges them; removing it restores them', () => {
    const s = loaded();
    const detected = s.getState().climbs.filter(c => c.summitKm < 11);
    assert.equal(detected.length, 2, 'climbs A and B are detected separately');
    const merged = s.addManualClimb(2000, 9800);
    assert.ok(merged && merged.manual);
    const now = s.getState().climbs.filter(c => c.summitKm < 11);
    assert.equal(now.length, 1);
    assert.ok(Math.abs(now[0].gainM - 470) <= 10, `merged gain ${now[0].gainM}`);
    assert.equal(now[0].category, 'Cat 2'); // 7.8 km at 6 %: score 280

    s.removeManualClimb(merged.id);
    assert.equal(s.getState().climbs.filter(c => c.summitKm < 11).length, 2);
    s.undo();
    assert.equal(s.getState().climbs.filter(c => c.summitKm < 11).length, 1, 'undo brings the manual climb back');
  });

  it('two manual climbs split one detected climb', () => {
    const s = loaded();
    s.addManualClimb(2000, 4000);
    s.addManualClimb(4000, 6000);
    const a = s.getState().climbs.filter(c => c.summitKm <= 6.1);
    assert.equal(a.length, 2);
    assert.ok(a.every(c => c.manual && Math.abs(c.gainM - 150) <= 10), JSON.stringify(a.map(c => c.gainM)));
  });

  it('rejects stretches that do not climb', () => {
    const s = loaded();
    assert.equal(s.addManualClimb(10000, 12000), null, 'downhill');
    assert.equal(s.addManualClimb(3000, 3050), null, 'under 100 m');
    assert.equal(s.getState().settings.manualClimbs.length, 0);
  });

  it('manual climbs and the threshold travel in share links; a new route clears them', () => {
    const s = loaded();
    s.addManualClimb(2000, 9800);
    s.updateSettings({ climbMinGainM: 60 });
    const receiver = createStore();
    assert.equal(receiver.loadPayload(deserializeBinaryState(serializeBinaryState(s.getState()))), true);
    const r = receiver.getState();
    assert.equal(r.settings.climbMinGainM, 60);
    assert.deepEqual(r.settings.manualClimbs, [[2000, 9800]]);
    assert.ok(r.climbs.some(c => c.manual));

    receiver.setTrack({ title: 'Other', coords });
    assert.deepEqual(receiver.getState().settings.manualClimbs, []);
    assert.ok(!receiver.getState().climbs.some(c => c.manual));
  });

  it('sanitizeManualClimbs drops malformed, reversed, too short and excess ranges', () => {
    const many = Array.from({ length: 80 }, (_, i) => [i * 1000, i * 1000 + 500]);
    assert.equal(sanitizeManualClimbs(many).length, 50);
    assert.deepEqual(sanitizeManualClimbs([[100, 50], [0, 20], ['a', 500], [-5, 500], [0, Infinity], [10.4, 600.6], null]), [[10, 601]]);
    assert.deepEqual(sanitizeManualClimbs('nope'), []);
  });

  it('measureClimb snaps to the nearest points and returns null without a route', () => {
    const { points } = processTrackSignal(coords, 7, 1000);
    const c = measureClimb(points, 2003, 5998);
    assert.ok(Math.abs(c.startKm - 2) < 0.011, `foot at ${c.startKm}`);
    assert.ok(Math.abs(c.summitKm - 6) < 0.011, `summit at ${c.summitKm}`);
    assert.equal(measureClimb([], 0, 1000), null);
  });
});
