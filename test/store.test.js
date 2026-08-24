/**
 * Reactive Store Test Suite
 *
 * Tests state transitions, action dispatchers, waypoint management,
 * and subscription event triggers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

describe('Store Module: State & Lifecycle', () => {
  it('initializes with default settings', () => {
    const store = createStore();
    const state = store.getState();

    assert.equal(state.settings.widthMm, 110);
    assert.equal(state.settings.heightMm, 35);
    assert.equal(state.settings.theme, 'white');
    assert.equal(state.points.length, 0);
  });

  it('updates settings and notifies subscribers', () => {
    const store = createStore();
    let eventReceived = null;

    store.subscribe((state, event) => {
      eventReceived = event;
    });

    store.updateSettings({ theme: 'giro', widthMm: 120 });
    const state = store.getState();

    assert.equal(state.settings.theme, 'giro');
    assert.equal(state.settings.widthMm, 120);
    assert.equal(eventReceived, 'settings:updated');
  });

  it('processes track coordinates and calculates telemetry stats', () => {
    const store = createStore();
    const coords = [
      { lat: 45.000, lon: 6.000, ele: 500 },
      { lat: 45.005, lon: 6.000, ele: 550 },
      { lat: 45.010, lon: 6.000, ele: 650 },
      { lat: 45.015, lon: 6.000, ele: 750 },
      { lat: 45.020, lon: 6.000, ele: 900 }
    ];

    store.setTrack({ title: 'Test Climb', coords });
    const state = store.getState();

    assert.equal(state.settings.title, 'Test Climb');
    assert.ok(state.points.length >= 3);
    assert.ok(state.stats !== null);
    assert.ok(state.stats.totalDist > 0);
    assert.ok(state.stats.elevGain > 0);
  });

  it('manages waypoint adding, toggling, and removal', () => {
    const store = createStore();
    const wpt = store.addWaypoint(15000, 'water', 'Spring Water');

    let state = store.getState();
    assert.equal(state.waypoints.length, 1);
    assert.equal(state.waypoints[0].type, 'water');
    assert.equal(state.waypoints[0].label, 'Spring Water');
    assert.equal(state.waypoints[0].enabled, true);

    // Toggle
    store.toggleWaypoint(wpt.id);
    state = store.getState();
    assert.equal(state.waypoints[0].enabled, false);

    // Remove
    store.removeWaypoint(wpt.id);
    state = store.getState();
    assert.equal(state.waypoints.length, 0);
  });

  it('toggles climb visibility and sets custom drag positions', () => {
    const store = createStore();
    store.toggleClimbVisibility(1);
    assert.deepEqual(store.getState().settings.hiddenClimbIds, [1]);

    store.toggleClimbVisibility(1);
    assert.deepEqual(store.getState().settings.hiddenClimbIds, []);

    // Custom positions
    store.setCustomPosition('climb-1', { x: 30, y: 15 });
    assert.deepEqual(store.getState().settings.customPositions['climb-1'], { x: 30, y: 15 });

    store.resetCustomPositions();
    assert.deepEqual(store.getState().settings.customPositions, {});
  });

  it('handles empty or single point tracks by resetting computed state', () => {
    const store = createStore();
    store.setTrack({ title: 'Empty Track', coords: [] });
    let state = store.getState();
    assert.equal(state.points.length, 0);
    assert.equal(state.stats, null);

    store.setTrack({ title: 'Single Point Track', coords: [{ lat: 45.0, lon: 6.0, ele: 100 }] });
    state = store.getState();
    assert.equal(state.points.length, 0);
    assert.equal(state.stats, null);
  });

  it('restores state from valid payload and rejects invalid payload', () => {
    const store = createStore();
    const validPayload = {
      title: 'Restored Stage',
      coords: [
        { lat: 45.0, lon: 6.0, ele: 500 },
        { lat: 45.1, lon: 6.1, ele: 1000 }
      ],
      settings: { theme: 'tour', blockSizeM: 500 },
      waypoints: [{ id: 'w1', distM: 2000, type: 'feed', label: 'Feed 1', enabled: true }]
    };

    assert.equal(store.loadPayload(validPayload), true);
    let state = store.getState();
    assert.equal(state.settings.title, 'Restored Stage');
    assert.equal(state.settings.theme, 'tour');
    assert.equal(state.waypoints.length, 1);
    assert.ok(state.points.length >= 2);

    // Invalid payloads
    assert.equal(store.loadPayload(null), false);
    assert.equal(store.loadPayload({ coords: [] }), false);
    assert.equal(store.loadPayload({ coords: [{ lat: 45.0, lon: 6.0, ele: 500 }] }), false);
  });

  it('properly unsubscribes listeners and isolates subscriber errors', () => {
    const store = createStore();
    let count1 = 0;
    let count2 = 0;

    const unsub1 = store.subscribe(() => {
      count1++;
      throw new Error('Subscriber error simulation');
    });

    const unsub2 = store.subscribe(() => {
      count2++;
    });

    store.updateSettings({ theme: 'dark' });
    assert.equal(count1, 1);
    assert.equal(count2, 1); // Second subscriber still runs despite error in first

    unsub1();
    store.updateSettings({ theme: 'white' });
    assert.equal(count1, 1); // Unsubscribed
    assert.equal(count2, 2);

    unsub2();
  });
});
