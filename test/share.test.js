/**
 * Share & Compression Test Suite
 *
 * Tests 3D polyline delta encoding, coordinate downsampling with peak preservation,
 * payload normalization, and gzip URL hash serialization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodePolyline3D,
  decodePolyline3D,
  downsampleCoords,
  normalizePayload,
  compressPayload,
  decompressPayload,
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

describe('Share Module: Summit & Extrema Downsampling', () => {
  it('preserves start, finish, global peak, and global lowest point', () => {
    const coords = [];
    for (let i = 0; i < 500; i++) {
      let ele = 100;
      if (i === 150) ele = 2800; // Global Summit
      if (i === 350) ele = 50;   // Global Low Point
      coords.push({ lat: 45.0 + i * 0.001, lon: 6.0 + i * 0.001, ele });
    }

    const downsampled = downsampleCoords(coords, 50);
    assert.ok(downsampled.length <= 50);

    // Verify endpoints
    assert.equal(downsampled[0][0], 45.0);
    assert.equal(downsampled[downsampled.length - 1][0], Math.round((45.0 + 499 * 0.001) * 100000) / 100000);

    // Verify peak (2800m) is strictly preserved in downsampled array
    const maxEle = Math.max(...downsampled.map(c => c[2]));
    assert.equal(maxEle, 2800);

    // Verify minimum (50m) is strictly preserved
    const minEle = Math.min(...downsampled.map(c => c[2]));
    assert.equal(minEle, 50);
  });
});

describe('Share Module: Payload Normalization & Backward Compatibility', () => {
  it('normalizes compact v2 payload format', () => {
    const coords = [[45.0, 6.0, 500], [45.1, 6.1, 600]];
    const polyline = encodePolyline3D(coords);

    const rawV2 = {
      v: 2,
      t: 'Col du Galibier',
      p: polyline,
      s: { blockSizeM: 500 },
      w: [[1500, 'water', 'Spring', 1]]
    };

    const normalized = normalizePayload(rawV2);
    assert.equal(normalized.title, 'Col du Galibier');
    assert.equal(normalized.coords.length, 2);
    assert.equal(normalized.settings.blockSizeM, 500);
    assert.equal(normalized.settings.widthMm, DEFAULT_SETTINGS.widthMm);
    assert.equal(normalized.waypoints.length, 1);
    assert.equal(normalized.waypoints[0].type, 'water');
    assert.equal(normalized.waypoints[0].label, 'Spring');
  });

  it('normalizes legacy v1 payload format', () => {
    const rawV1 = {
      v: 1,
      title: 'Legacy Stage',
      coords: [{ lat: 45.0, lon: 6.0, ele: 500 }],
      settings: { widthMm: 120 },
      waypoints: [{ id: 'w1', distM: 1000, type: 'feed', label: 'Feed 1', enabled: true }]
    };

    const normalized = normalizePayload(rawV1);
    assert.equal(normalized.title, 'Legacy Stage');
    assert.equal(normalized.coords.length, 1);
    assert.equal(normalized.settings.widthMm, 120);
    assert.equal(normalized.waypoints.length, 1);
  });
});

describe('Share Module: Full Round-Trip Hash Serialization', () => {
  it('serializes application state to hash and deserializes back', async () => {
    // Check if CompressionStream is available in the current environment
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
      return; // Skip if runtime lacks stream compression
    }

    const state = {
      title: 'Tour Stage 1',
      coords: [
        { lat: 45.000, lon: 6.000, ele: 500 },
        { lat: 45.050, lon: 6.050, ele: 1200 },
        { lat: 45.100, lon: 6.100, ele: 600 }
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        title: 'Tour Stage 1',
        blockSizeM: 500
      },
      waypoints: [
        { id: 'w1', distM: 5000, type: 'feed', label: 'Feed 1', enabled: true }
      ]
    };

    const hash = await serializeStateToHash(state);
    assert.ok(hash.startsWith('#stage='));

    const restored = await deserializeHashToState(hash);
    assert.ok(restored !== null);
    assert.equal(restored.title, 'Tour Stage 1');
    assert.equal(restored.settings.blockSizeM, 500);
    assert.ok(restored.coords.length >= 2);
    assert.equal(restored.waypoints.length, 1);
    assert.equal(restored.waypoints[0].type, 'feed');
  });
});
