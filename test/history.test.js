/**
 * Undo / Redo History Test Suite
 *
 * Tests store history: snapshots of settings, waypoints and the fueling plan,
 * merging of rapid edits, reprocessing on restore, and history resets.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

const coords = [];
for (let i = 0; i <= 300; i++) {
  coords.push({ lat: 45 + i * 0.0009, lon: 6, ele: 400 + 500 * Math.max(0, Math.sin(i / 40)) });
}

describe('History: Undo / Redo', () => {
  let store;
  let now;
  const realNow = Date.now;

  beforeEach(() => {
    now = 1_000_000;
    Date.now = () => now;
    store = createStore();
    store.setTrack({ title: 'History Route', coords });
  });
  afterEach(() => { Date.now = realNow; });

  it('starts empty after loading a track', () => {
    assert.equal(store.canUndo(), false);
    assert.equal(store.canRedo(), false);
    assert.equal(store.undo(), false);
  });

  it('undoes and redoes a settings change', () => {
    store.updateSettings({ theme: 'dark' });
    assert.equal(store.getState().settings.theme, 'dark');

    assert.equal(store.undo(), true);
    assert.equal(store.getState().settings.theme, 'white');
    assert.equal(store.canRedo(), true);

    assert.equal(store.redo(), true);
    assert.equal(store.getState().settings.theme, 'dark');
  });

  it('undoes waypoint add, toggle and remove in order', () => {
    const w = store.addWaypoint(5000, 'feed', 'Feed');
    store.toggleWaypoint(w.id);
    store.removeWaypoint(w.id);
    assert.equal(store.getState().waypoints.length, 0);

    store.undo();
    assert.equal(store.getState().waypoints[0].enabled, false);
    store.undo();
    assert.equal(store.getState().waypoints[0].enabled, true);
    store.undo();
    assert.equal(store.getState().waypoints.length, 0);
  });

  it('undoes fuel plan edits including regeneration', () => {
    const before = store.getState().fueling.items.map(i => i.id);
    const item = store.addFuelItem({ distM: 12000, type: 'gel', name: 'Extra' });
    store.updateFuelItem(item.id, { carbsG: 45 });
    store.removeFuelItem(before[0]);

    store.undo();
    store.undo();
    assert.equal(store.getState().fueling.items.find(i => i.id === item.id).carbsG, 25);
    store.undo();
    assert.deepEqual(store.getState().fueling.items.map(i => i.id), before);
  });

  it('merges rapid edits of the same field into one step', () => {
    for (const title of ['A', 'Al', 'Alp', 'Alpe']) {
      store.updateSettings({ title });
      now += 200;
    }
    store.undo();
    assert.equal(store.getState().settings.title, 'History Route');
    assert.equal(store.canUndo(), false);
  });

  it('records separate steps after a pause or for a different field', () => {
    store.updateSettings({ title: 'One' });
    now += 2000;
    store.updateSettings({ title: 'Two' });
    store.updateSettings({ theme: 'giro' });

    store.undo();
    assert.equal(store.getState().settings.theme, 'white');
    assert.equal(store.getState().settings.title, 'Two');
    store.undo();
    assert.equal(store.getState().settings.title, 'One');
  });

  it('ignores no-op updates', () => {
    store.updateSettings({ theme: store.getState().settings.theme });
    store.updateFuelSettings({ avgSpeedKmh: store.getState().fueling.avgSpeedKmh });
    assert.equal(store.canUndo(), false);
  });

  it('clears redo after a new edit', () => {
    store.updateSettings({ theme: 'dark' });
    store.undo();
    store.updateSettings({ theme: 'tour' });
    assert.equal(store.canRedo(), false);
  });

  it('reprocesses blocks when undoing a block size change', () => {
    const initialSize = store.getState().settings.blockSizeM;
    const initialBlocks = store.getState().blocks.length;
    store.updateSettings({ blockSizeM: initialSize * 2 }, true);
    assert.ok(store.getState().blocks.length < initialBlocks);
    store.undo();
    assert.equal(store.getState().settings.blockSizeM, initialSize);
    assert.equal(store.getState().blocks.length, initialBlocks);
  });

  it('restores snapshots as independent copies', () => {
    store.updateSettings({ hiddenClimbIds: [1] });
    store.undo();
    store.getState().settings.hiddenClimbIds.push(99);
    store.redo();
    assert.deepEqual(store.getState().settings.hiddenClimbIds, [1]);
  });

  it('emits history:restored and resets on new track load', () => {
    const events = [];
    store.subscribe((_, e) => events.push(e));
    store.updateSettings({ theme: 'dark' });
    store.undo();
    assert.ok(events.includes('history:restored'));

    store.updateSettings({ theme: 'neon' });
    store.setTrack({ title: 'New Route', coords });
    assert.equal(store.canUndo(), false);
  });
});
