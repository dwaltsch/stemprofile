/**
 * Robustness Test Suite
 *
 * Hostile and broken inputs (crafted share links, malformed route files,
 * corrupted storage) must load safely or fail with a clear error: no crash,
 * no NaN in rendered output, and bounded work.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/dom-shim.js';
import { createStore } from '../js/store.js';
import { renderFuelingSVG } from '../js/fueling-renderer.js';
import { renderClimbDetailStackSVG } from '../js/renderer/climb-detail.js';
import { parseRouteFile } from '../js/parser.js';
import { normalizeCoordinates } from '../js/units.js';
import { MAX_TRACK_POINTS, MAX_IMPORTED_WAYPOINTS, MAX_TITLE_CHARS, MAX_LABEL_CHARS, MAX_FILE_BYTES } from '../js/limits.js';
import { handleRouteFile } from '../js/ui/dropzone.js';
import { installStubDocument } from './helpers/stub-document.js';
import { renderProfileSVG } from '../js/renderer.js';
import { generatePrintSheetMarkup, MAX_PRINT_CELLS } from '../js/export.js';
import { buildSpatialBlocks, MAX_SPATIAL_BLOCKS, dropPositionSpikes } from '../js/signal.js';
import {
  clampSettings,
  SETTING_LIMITS,
  compressPayload,
  deserializeHashToState,
  decompressPayload,
  sanitizePayload,
  MAX_LINK_CHARS,
  MAX_DECOMPRESSED_BYTES,
  MAX_SHARED_POINTS,
  MAX_SHARED_WAYPOINTS
} from '../js/share.js';

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

describe('Robustness: Share Link Size Limits', () => {
  it('rejects a compression bomb without inflating it fully', async () => {
    const bomb = await compressPayload(new Uint8Array(200 * 1024 * 1024));
    // Count inflated bytes actually produced by wrapping DecompressionStream
    const Original = globalThis.DecompressionStream;
    let inflated = 0;
    globalThis.DecompressionStream = class {
      constructor(format) {
        const inner = new Original(format);
        this.writable = inner.writable;
        this.readable = inner.readable.pipeThrough(new TransformStream({
          transform(chunk, ctrl) { inflated += chunk.length; ctrl.enqueue(chunk); }
        }));
      }
    };
    try {
      assert.equal(await decompressPayload(bomb), null);
    } finally {
      globalThis.DecompressionStream = Original;
    }
    assert.ok(inflated < MAX_DECOMPRESSED_BYTES + 1024 * 1024, `inflated ${inflated} bytes before stopping`);
  });

  it('rejects links longer than MAX_LINK_CHARS', async () => {
    assert.equal(await decompressPayload('A'.repeat(MAX_LINK_CHARS + 1)), null);
  });

  it('still decodes normal links', async () => {
    const payload = await deserializeHashToState(await legacyLink({ t: 'ok', coords: routeCoords }));
    assert.equal(payload.title, 'ok');
    assert.equal(payload.coords.length, routeCoords.length);
  });

  it('thins oversized coordinate lists evenly and caps waypoints', () => {
    const coords = Array.from({ length: 500000 }, (_, i) => [45 + i * 1e-5, 6, 500]);
    const waypoints = Array.from({ length: 5000 }, (_, i) => ({ distM: i, type: 'feed' }));
    const out = sanitizePayload({ coords, waypoints });
    assert.equal(out.coords.length, MAX_SHARED_POINTS);
    assert.deepEqual(out.coords[0], coords[0]);
    assert.deepEqual(out.coords[out.coords.length - 1], coords[coords.length - 1]);
    assert.equal(out.waypoints.length, MAX_SHARED_WAYPOINTS);
  });
});

/** Loads coords into a fresh store and renders every sticker kind. */
function loadAndRenderAll(coords) {
  const store = createStore();
  store.setTrack({ title: 't', coords });
  const s = store.getState();
  const out = renderProfileSVG(s) + renderFuelingSVG(s) + renderClimbDetailStackSVG(s).svg;
  return { state: s, out };
}

const straight = (n, ele) => Array.from({ length: n }, (_, i) => ({ lat: 45 + i * 0.001, lon: 6, ele: ele(i) }));

describe('Robustness: Invalid Coordinates', () => {
  it('rejects a route whose points are all identical', () => {
    assert.throws(() => loadAndRenderAll(Array.from({ length: 50 }, () => ({ lat: 45, lon: 6, ele: 500 }))), /distinct/);
  });

  it('fills NaN, Infinity and text elevations instead of leaking NaN', () => {
    const { out, state } = loadAndRenderAll(straight(100, i => (i % 3 ? NaN : (i % 2 ? Infinity : 500))));
    assert.ok(!/NaN|Infinity/.test(out));
    assert.ok(state.points.every(p => Number.isFinite(p.smoothEle)));
    const strings = loadAndRenderAll(straight(100, () => 'abc'));
    assert.ok(!/NaN/.test(strings.out));
  });

  it('fills physically impossible elevations from neighbours', () => {
    const coords = normalizeCoordinates([[45, 6, 1e7], [45.001, 6, 400], [45.002, 6, -1e9], [45.003, 6, 420]]);
    assert.deepEqual(coords.map(c => c.ele), [400, 400, 400, 420]);
  });

  it('skips null entries instead of placing them at 0,0', () => {
    const coords = normalizeCoordinates([null, { lat: 45, lon: 6, ele: 1 }, undefined, 'x', [45.01, 6, 2]]);
    assert.equal(coords.length, 2);
    const { state } = loadAndRenderAll([null, { lat: 45, lon: 6, ele: 1 }, undefined, { lat: 45.01, lon: 6, ele: 2 }, { lat: 45.02, lon: 6, ele: 3 }]);
    assert.ok(state.stats.totalDist < 5000, `distance ${state.stats.totalDist}`);
  });

  it('drops out-of-range latitude / longitude', () => {
    assert.equal(normalizeCoordinates([[500, 6, 1], [45, 900, 1], [45, 6, 1], [-91, 0, 1]]).length, 1);
    assert.throws(() => loadAndRenderAll(Array.from({ length: 100 }, (_, i) => ({ lat: 500 + i, lon: 900, ele: 500 }))));
  });

  it('GPX: <ele>1e400</ele> does not produce Infinity', () => {
    const gpx = '<?xml version="1.0"?><gpx><trk><trkseg>' +
      '<trkpt lat="45" lon="6"><ele>100</ele></trkpt><trkpt lat="45.01" lon="6"><ele>1e400</ele></trkpt>' +
      '<trkpt lat="45.02" lon="6"><ele>120</ele></trkpt></trkseg></trk></gpx>';
    const { coords } = parseRouteFile(gpx, 'a.gpx');
    const { out } = loadAndRenderAll(coords);
    assert.ok(!/NaN|Infinity/.test(out));
  });

  it('shared links with garbage coordinates are rejected or cleaned', async () => {
    const bad = await deserializeHashToState(await legacyLink({ t: 'x', coords: ['a', { lat: 'x' }, [1], [45, 6, 1], [45.1, 6, 2]] }));
    const store = createStore();
    assert.equal(store.loadPayload(bad), true);
    assert.equal(store.getState().rawCoords.length, 2, 'only the two complete points remain ([1] has no longitude)');
    const allSame = await deserializeHashToState(await legacyLink({ t: 'x', coords: [[45, 6, 1], [45, 6, 1]] }));
    assert.equal(createStore().loadPayload(allSame), false);
  });
});

describe('Robustness: GPS Position Glitches', () => {
  const track = n => Array.from({ length: n }, (_, i) => ({ lat: 45 + i * 0.001, lon: 6, ele: 500 }));

  it('drops a single fix that teleports across the globe and back', () => {
    const coords = track(100);
    coords[50] = { lat: -45, lon: -174, ele: 500 };
    const { state } = loadAndRenderAll(coords);
    assert.ok(state.stats.totalDist < 12000, `distance ${Math.round(state.stats.totalDist)} m`);
    assert.equal(state.rawCoords.length, 99);
  });

  it('drops a short run of glitched fixes', () => {
    const coords = track(100);
    for (let i = 40; i < 44; i++) coords[i] = { lat: 10 + i * 0.001, lon: 20, ele: 500 };
    assert.equal(dropPositionSpikes(coords).length, 96);
  });

  it('drops a bad first fix', () => {
    const coords = [{ lat: 0, lon: 0, ele: 0 }, ...track(50)];
    const out = dropPositionSpikes(coords);
    assert.equal(out.length, 50);
    assert.equal(out[0].lat, 45);
  });

  it('keeps a genuine gap that does not come back (ferry / joined tracks)', () => {
    const coords = [...track(50), ...track(50).map(c => ({ ...c, lon: 6.5 }))];
    assert.equal(dropPositionSpikes(coords).length, 100);
  });

  it('leaves normal and synthetic-distance tracks unchanged', () => {
    const coords = track(200);
    assert.deepEqual(dropPositionSpikes(coords), coords);
    const synthetic = Array.from({ length: 10 }, (_, i) => ({ dist: i * 1e6, lat: 0, lon: 0, ele: 1 }));
    assert.equal(dropPositionSpikes(synthetic), synthetic);
  });
});

describe('Robustness: Input Size Limits', () => {
  it('thins huge tracks to MAX_TRACK_POINTS keeping elevation extremes', () => {
    const coords = Array.from({ length: 400000 }, (_, i) => ({ lat: 45 + i * 1e-5, lon: 6, ele: i === 123457 ? 2999 : 500 + 300 * Math.sin(i / 9000) }));
    const t0 = Date.now();
    const store = createStore();
    store.setTrack({ title: 'big', coords });
    assert.ok(Date.now() - t0 < 5000);
    assert.equal(store.getState().rawCoords.length, MAX_TRACK_POINTS);
    assert.ok(store.getState().rawCoords.some(c => c.ele === 2999), 'summit point survives thinning');
  });

  it('caps imported waypoints so matching stays fast', () => {
    const coords = Array.from({ length: 50000 }, (_, i) => ({ lat: 45 + i * 2e-5, lon: 6, ele: 500 }));
    const rawWaypoints = Array.from({ length: 10000 }, (_, i) => ({ lat: 45 + i * 1e-4, lon: 6, name: 'W' + i, sym: '', desc: '', typeStr: '' }));
    const t0 = Date.now();
    const store = createStore();
    store.setTrack({ title: 'x', coords, rawWaypoints });
    assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
    assert.ok(store.getState().waypoints.length <= MAX_IMPORTED_WAYPOINTS);
  });

  it('caps title and label lengths', () => {
    const store = createStore();
    store.setTrack({
      title: 'T'.repeat(1e6),
      coords: [[45, 6, 1], [45.01, 6, 2], [45.02, 6, 3]],
      rawWaypoints: [{ lat: 45.01, lon: 6, name: 'N'.repeat(1e5), sym: '', desc: 'D'.repeat(1e5), typeStr: '' }]
    });
    assert.equal(store.getState().settings.title.length, MAX_TITLE_CHARS);
    assert.ok(store.getState().rawWaypoints[0].name.length <= MAX_LABEL_CHARS);
    store.updateSettings({ title: 'x'.repeat(5000) });
    assert.equal(store.getState().settings.title.length, MAX_TITLE_CHARS);
    assert.equal(store.addWaypoint(100, 'feed', 'L'.repeat(5000)).label.length, MAX_LABEL_CHARS);
  });

  it('refuses files above MAX_FILE_BYTES before reading them', () => {
    const dom = installStubDocument();
    const prevReader = globalThis.FileReader;
    let read = false;
    globalThis.FileReader = class { readAsText() { read = true; } readAsArrayBuffer() { read = true; } };
    try {
      handleRouteFile({ name: 'huge.gpx', size: MAX_FILE_BYTES + 1 }, createStore());
    } finally {
      globalThis.FileReader = prevReader;
      dom.restore();
    }
    assert.equal(read, false);
  });
});
