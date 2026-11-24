/**
 * Share & Compression Test Suite
 *
 * Tests 3D polyline delta encoding, coordinate downsampling,
 * adaptive profile curve simplification, packed binary protocol (v4),
 * and ultra-short URL hash serialization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  downsampleCoords,
  simplifyProfileCurve,
  serializeBinaryState,
  deserializeBinaryState,
  safeReadSlice,
  serializeStateToHash,
  deserializeHashToState,
  DEFAULT_SETTINGS
} from '../js/share.js';
import { createStore } from '../js/store.js';

describe('Share Module: Boundary Validation Helper (safeReadSlice)', () => {
  it('safely slices bytes and clamps bounds', () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50]);
    assert.deepEqual(Array.from(safeReadSlice(bytes, 1, 3)), [20, 30, 40]);
    assert.deepEqual(Array.from(safeReadSlice(bytes, 3, 10)), [40, 50]); // clamped to length
    assert.deepEqual(Array.from(safeReadSlice(bytes, 10, 5)), []); // out of bounds
    assert.deepEqual(Array.from(safeReadSlice(null, 0, 5)), []);
  });
});

describe('Share Module: Adaptive Profile Curve Simplification', () => {
  it('preserves start, finish, summits, and global extrema', () => {
    const points = [];
    for (let i = 0; i <= 1000; i++) {
      const dist = i * 100;
      let ele = 300;
      if (i >= 200 && i <= 400) ele += (i - 200) * 10; // Peak at 400 -> 2300m
      if (i > 400 && i <= 600) ele += (600 - i) * 10;
      if (i >= 700 && i <= 850) ele += (i - 700) * 8; // Peak at 850 -> 1500m
      if (i > 850 && i <= 950) ele += (950 - i) * 8;
      points.push({ dist, smoothEle: ele });
    }

    const simplified = simplifyProfileCurve(points, 65, 2.0);
    assert.ok(simplified.length <= 65);
    assert.equal(simplified[0][0], 0);
    assert.equal(simplified[simplified.length - 1][0], 100000);

    const maxEle = Math.max(...simplified.map(p => p[1]));
    assert.ok(Math.abs(maxEle - 2300) < 5, 'Summit peak preserved');
  });
});

describe('Share Module: Binary Protocol (Version 4)', () => {
  it('serializes and deserializes full state with settings, climbs, and waypoints', () => {
    const state = {
      title: 'Queen Stage 19 - Galibier',
      points: [
        { dist: 0, ele: 500 },
        { dist: 30000, ele: 1500 },
        { dist: 60000, ele: 700 },
        { dist: 110000, ele: 2642 },
        { dist: 140000, ele: 600 }
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        theme: 'giro',
        blockSizeM: 2000,
        hiddenClimbIds: [1]
      },
      waypoints: [
        { distM: 29000, type: 'feed', label: 'Feed 1', enabled: true },
        { distM: 110000, type: 'summit', label: 'Galibier', enabled: true }
      ]
    };

    const binary = serializeBinaryState(state);
    assert.ok(binary instanceof Uint8Array);
    assert.equal(binary[0], 4); // Protocol v4

    const restored = deserializeBinaryState(binary);
    assert.ok(restored !== null);
    assert.equal(restored.title, 'Queen Stage 19 - Galibier');
    assert.equal(restored.settings.theme, 'giro');
    assert.equal(restored.settings.blockSizeM, 2000);
    assert.deepEqual(restored.settings.hiddenClimbIds, [1]);
    assert.equal(restored.waypoints.length, 2);
    assert.equal(restored.waypoints[1].label, 'Galibier');
    assert.ok(restored.coords.length >= 2);
  });

  it('safely handles truncated or malformed binary buffers without throwing', () => {
    // Null, empty, or too short buffer
    assert.equal(deserializeBinaryState(null), null);
    assert.equal(deserializeBinaryState(new Uint8Array(0)), null);
    assert.equal(deserializeBinaryState(new Uint8Array([4, 1, 2])), null);
    assert.equal(deserializeBinaryState(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), null); // wrong magic version

    // Truncated title length header claiming 100 bytes when only 5 exist
    const corruptedTitle = new Uint8Array([4, 100, 65, 66, 67, 68]);
    assert.equal(deserializeBinaryState(corruptedTitle), null);

    // Truncated point count
    const state = {
      title: 'Short',
      points: [{ dist: 0, ele: 100 }, { dist: 1000, ele: 200 }],
      settings: DEFAULT_SETTINGS,
      waypoints: []
    };
    const validBinary = serializeBinaryState(state);
    assert.ok(validBinary.length > 10);

    // Truncate at various byte offsets from 1 to validBinary.length - 1
    for (let len = 1; len < validBinary.length; len++) {
      const truncated = validBinary.subarray(0, len);
      const result = deserializeBinaryState(truncated);
      // Must either return null or a safe valid object, NEVER throw
      assert.ok(result === null || typeof result === 'object');
    }
  });
});

describe('Share Module: Full Round-Trip Hash Serialization', () => {
  it('serializes application state to ultra-short hash and deserializes back', async () => {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
      return;
    }

    const state = {
      title: 'Tour Stage 1',
      points: [
        { dist: 0, smoothEle: 500 },
        { dist: 25000, smoothEle: 1200 },
        { dist: 50000, smoothEle: 600 }
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        title: 'Tour Stage 1',
        theme: 'tour',
        blockSizeM: 1000
      },
      waypoints: [
        { id: 'w1', distM: 5000, type: 'feed', label: 'Feed 1', enabled: true }
      ]
    };

    const hash = await serializeStateToHash(state);
    assert.ok(hash.startsWith('#stage='));
    // Ultra-short verification: should be under 200 characters
    assert.ok(hash.length < 200, `Expected hash < 200 chars, got ${hash.length}: ${hash}`);

    const restored = await deserializeHashToState(hash);
    assert.ok(restored !== null);
    assert.equal(restored.title, 'Tour Stage 1');
    assert.equal(restored.settings.theme, 'tour');
    assert.equal(restored.settings.blockSizeM, 1000);
    assert.ok(restored.coords.length >= 2);
    assert.equal(restored.waypoints.length, 1);
    assert.equal(restored.waypoints[0].type, 'feed');
  });

  it('safely handles malformed and invalid base64 hash strings without throwing', async () => {
    assert.equal(await deserializeHashToState(''), null);
    assert.equal(await deserializeHashToState(null), null);
    assert.equal(await deserializeHashToState('#stage=!!!invalid@@@base64==='), null);
    assert.equal(await deserializeHashToState('#stage=AQID'), null); // Valid base64, but invalid payload
    assert.equal(await deserializeHashToState('#data=123'), null);
  });
});

describe('Share Module: Fuel Plan in Links', () => {
  const coords = Array.from({ length: 1200 }, (_, i) => [45 + i * 0.0004, 6, 300 + 250 * Math.sin(i / 90)]);

  function loadedStore(title = 'Fuel route') {
    const s = createStore();
    s.setTrack({ title, coords });
    return s;
  }

  it('carries hand-edited fuel items, notes and fueling settings', () => {
    const sender = loadedStore();
    sender.updateFuelSettings({ targetCarbsPerHour: 95, avgSpeedKmh: 31.5, pacingMode: 'constant', mode: 'time' });
    sender.addFuelItem({ distM: 12345, type: 'bar', name: 'Rice cake 🍙', carbsG: 33, fluidMl: 0, notes: 'before the climb' });
    const restored = deserializeBinaryState(serializeBinaryState(sender.getState()));
    const receiver = createStore();
    assert.equal(receiver.loadPayload(restored), true);

    const f = receiver.getState().fueling;
    assert.equal(f.targetCarbsPerHour, 95);
    assert.equal(f.avgSpeedKmh, 31.5);
    assert.equal(f.pacingMode, 'constant');
    assert.equal(f.mode, 'time');
    assert.equal(f.customized, true);
    assert.equal(f.items.length, sender.getState().fueling.items.length);
    const cake = f.items.find(it => it.name === 'Rice cake 🍙');
    assert.ok(cake, 'edited item survives');
    assert.equal(cake.distM, 12350); // 10 m resolution
    assert.equal(cake.carbsG, 33);
    assert.equal(cake.notes, 'before the climb');
    assert.ok(cake.timeSec > 0, 'items are re-timed on the receiving side');
  });

  it('sends an untouched generated plan exactly as the sender sees it', () => {
    const sender = loadedStore();
    const receiver = createStore();
    receiver.loadPayload(deserializeBinaryState(serializeBinaryState(sender.getState())));
    const f = receiver.getState().fueling;
    assert.equal(f.customized, false);
    assert.deepEqual(
      f.items.map(it => [it.distM, it.type, it.carbsG]),
      sender.getState().fueling.items.map(it => [Math.round(it.distM / 10) * 10, it.type, it.carbsG])
    );
  });

  it('generates a plan when a link has no fuel items', () => {
    const sender = loadedStore();
    const payload = deserializeBinaryState(serializeBinaryState({ ...sender.getState(), fueling: { ...sender.getState().fueling, items: [] } }));
    const receiver = createStore();
    receiver.loadPayload(payload);
    assert.ok(receiver.getState().fueling.items.length > 0);
  });

  it('replaces the previous route\'s plan when a link is opened', () => {
    const receiver = createStore();
    receiver.setTrack({ title: 'Long', coords: Array.from({ length: 3000 }, (_, i) => [46 + i * 0.0004, 7, 500]) });
    const shortRoute = createStore();
    shortRoute.setTrack({ title: 'Short', coords: coords.slice(0, 300) });
    receiver.loadPayload(deserializeBinaryState(serializeBinaryState(shortRoute.getState())));
    const { fueling, stats } = receiver.getState();
    assert.ok(fueling.items.length > 0, 'a plan is generated for the shared route');
    assert.ok(fueling.items.every(it => it.distM <= stats.totalDist), 'no items beyond the shared route');
  });

  it('drops shared fuel items beyond the route end', () => {
    const sender = loadedStore();
    const payload = deserializeBinaryState(serializeBinaryState(sender.getState()));
    payload.fueling = { customized: true, items: [{ distM: 1e7, type: 'gel', name: 'far' }, { distM: 1000, type: 'nope', name: 'x', carbsG: 1e9 }] };
    const receiver = createStore();
    receiver.loadPayload(payload);
    const items = receiver.getState().fueling.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].type, 'gel');
    assert.equal(items[0].carbsG, 500);
  });

  it('keeps long multi-byte titles intact (length prefix never overflows a byte)', () => {
    const sender = loadedStore('Étape ' + '⛰'.repeat(110));
    const restored = deserializeBinaryState(serializeBinaryState(sender.getState()));
    assert.ok(restored, 'link still decodes');
    assert.ok(restored.title.startsWith('Étape ⛰'));
    assert.ok(!restored.title.includes('�'), 'no broken UTF-8 sequence');
  });
});
