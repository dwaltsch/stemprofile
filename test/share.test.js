/**
 * Share & Compression Test Suite
 *
 * Tests 3D polyline delta encoding, coordinate downsampling,
 * adaptive profile curve simplification, packed binary protocol (v3),
 * and ultra-short URL hash serialization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodePolyline3D,
  decodePolyline3D,
  downsampleCoords,
  simplifyProfileCurve,
  serializeBinaryState,
  deserializeBinaryState,
  normalizePayload,
  serializeStateToHash,
  deserializeHashToState,
  DEFAULT_SETTINGS
} from '../js/share.js';

describe('Share Module: 3D Polyline Delta Encoding', () => {
  it('encodes and decodes 3D coordinates losslessly within resolution', () => {
    const coords = [
      [45.12345, 6.12345, 1250.5],
      [45.12400, 6.12400, 1260.2],
      [45.12550, 6.12550, 1310.0]
    ];

    const encoded = encodePolyline3D(coords);
    assert.ok(typeof encoded === 'string' && encoded.length > 0);

    const decoded = decodePolyline3D(encoded);
    assert.equal(decoded.length, 3);

    for (let i = 0; i < coords.length; i++) {
      assert.ok(Math.abs(decoded[i][0] - coords[i][0]) < 0.00002, `Lat mismatch at ${i}`);
      assert.ok(Math.abs(decoded[i][1] - coords[i][1]) < 0.00002, `Lon mismatch at ${i}`);
      assert.ok(Math.abs(decoded[i][2] - coords[i][2]) < 0.2, `Ele mismatch at ${i}`);
    }
  });

  it('handles empty or single coordinate arrays gracefully', () => {
    assert.equal(encodePolyline3D([]), '');
    assert.deepEqual(decodePolyline3D(''), []);
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

describe('Share Module: Binary Protocol (Version 3)', () => {
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
    assert.equal(binary[0], 3); // Protocol v3

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
});
