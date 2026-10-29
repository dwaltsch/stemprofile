/**
 * Fuzz Harness Test Helper
 *
 * Seeded mutators, the end-to-end invariant check and the seed corpus shared
 * by test/fuzz.test.js and ad-hoc deep fuzzing runs.
 */

import assert from 'node:assert/strict';
import './dom-shim.js';
import { createTestFit } from './fit-builder.js';
import { parseRouteFile } from '../../js/parser.js';
import { createStore } from '../../js/store.js';
import { renderProfileSVG } from '../../js/renderer.js';
import { renderFuelingSVG } from '../../js/fueling-renderer.js';
import { renderClimbDetailStackSVG } from '../../js/renderer/climb-detail.js';
import { serializeBinaryState } from '../../js/share.js';

export const TIME_BUDGET_MS = 1500;
export const MAX_OUTPUT_CHARS = 5e6;

/** mulberry32: small, fast, seedable PRNG. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INTERESTING_BYTES = [0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff];
const WEIRD_TOKENS = ['NaN', '1e400', '-1e400', '', '-', ',', '0x10', '1,5', '99999999', '-91', '181', '<', '&amp;', ']]>'];

/** Applies 1-4 random byte-level mutations. */
export function mutateBytes(bytes, rand) {
  let b = Uint8Array.from(bytes);
  const pick = n => Math.floor(rand() * n);
  for (let m = 1 + pick(4); m > 0; m--) {
    const pos = pick(Math.max(1, b.length));
    switch (pick(6)) {
      case 0: b[pos] ^= 1 << pick(8); break;
      case 1: b[pos] = INTERESTING_BYTES[pick(INTERESTING_BYTES.length)]; break;
      case 2: { // insert random bytes
        const ins = Uint8Array.from({ length: 1 + pick(16) }, () => pick(256));
        b = Uint8Array.from([...b.subarray(0, pos), ...ins, ...b.subarray(pos)]);
        break;
      }
      case 3: b = Uint8Array.from([...b.subarray(0, pos), ...b.subarray(Math.min(b.length, pos + 1 + pick(32)))]); break;
      case 4: { // duplicate a run
        const run = b.subarray(pos, Math.min(b.length, pos + 1 + pick(64)));
        b = Uint8Array.from([...b.subarray(0, pos), ...run, ...b.subarray(pos)]);
        break;
      }
      default: b = b.subarray(0, Math.max(1, pos));
    }
  }
  return b;
}

/** Applies 1-3 text-level mutations aimed at XML number fields and structure. */
export function mutateText(text, rand) {
  let t = text;
  const pick = n => Math.floor(rand() * n);
  for (let m = 1 + pick(3); m > 0; m--) {
    const numbers = [...t.matchAll(/-?\d+(?:\.\d+)?/g)];
    switch (pick(4)) {
      case 0: if (numbers.length) {
        const n = numbers[pick(numbers.length)];
        t = t.slice(0, n.index) + WEIRD_TOKENS[pick(WEIRD_TOKENS.length)] + t.slice(n.index + n[0].length);
      } break;
      case 1: { // duplicate a tag-aligned slice
        const tags = [...t.matchAll(/<[^/!?][^>]*>/g)];
        if (tags.length > 1) {
          const a = tags[pick(tags.length)].index;
          const b = Math.min(t.length, a + 1 + pick(400));
          t = t.slice(0, b) + t.slice(a, b) + t.slice(b);
        }
      } break;
      case 2: t = t.slice(0, pick(t.length + 1)); break; // truncate
      default: t = new TextDecoder().decode(mutateBytes(new TextEncoder().encode(t), rand));
    }
  }
  return t;
}

/** Runs one input end to end and asserts the invariants. Returns 'rejected' or 'loaded'. */
export function checkInput(load, label) {
  const t0 = Date.now();
  let store;
  try {
    store = load();
  } catch (err) {
    assert.ok(err instanceof Error, `${label}: threw a non-Error ${String(err)}`);
    assert.ok(Date.now() - t0 < TIME_BUDGET_MS, `${label}: rejection took ${Date.now() - t0} ms`);
    return 'rejected';
  }
  if (!store) return 'rejected';
  const s = store.getState();
  const out = renderProfileSVG(s) + renderFuelingSVG(s) + renderClimbDetailStackSVG(s).svg;
  const ms = Date.now() - t0;
  assert.ok(ms < TIME_BUDGET_MS, `${label}: took ${ms} ms`);
  assert.ok(out.length < MAX_OUTPUT_CHARS, `${label}: ${out.length} chars of SVG`);
  const bad = out.match(/NaN|Infinity/);
  assert.equal(bad, null, `${label}: rendered output contains ${bad && bad[0]}`);
  return 'loaded';
}

export function loadFile(content, name) {
  return () => {
    const { title, coords, rawWaypoints } = parseRouteFile(content, name);
    const store = createStore();
    store.setTrack({ title, coords, rawWaypoints });
    return store;
  };
}

// --- Seed corpus ---
const pts = Array.from({ length: 120 }, (_, i) => ({ lat: 45 + i * 0.002, lon: 6 + i * 0.001, ele: 500 + 700 * Math.max(0, Math.sin(i / 20)) }));
export const SEED_GPX = `<?xml version="1.0"?><gpx version="1.1"><metadata><name>Fuzz &amp; Co</name></metadata>` +
  `<wpt lat="45.05" lon="6.025"><name>Feed</name><sym>Food</sym></wpt>` +
  `<trk><name>t</name><trkseg>${pts.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele.toFixed(1)}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;
export const SEED_TCX = `<?xml version="1.0"?><TrainingCenterDatabase><Courses><Course><Name>Fuzz</Name><Track>` +
  pts.map(p => `<Trackpoint><Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lon}</LongitudeDegrees></Position><AltitudeMeters>${p.ele.toFixed(1)}</AltitudeMeters></Trackpoint>`).join('') +
  `</Track><CoursePoint><Name>Summit</Name><Position><LatitudeDegrees>45.1</LatitudeDegrees><LongitudeDegrees>6.05</LongitudeDegrees></Position><PointType>Summit</PointType></CoursePoint></Course></Courses></TrainingCenterDatabase>`;
export const SEED_FIT = new Uint8Array(createTestFit({
  courseName: 'Fuzz',
  records: pts,
  coursePoints: [{ lat: 45.1, lon: 6.05, type: 1, name: 'Summit' }]
}));
const seedStore = createStore();
seedStore.setTrack({ title: 'Fuzz', coords: pts });
seedStore.addWaypoint(4000, 'feed', 'Feed');
export const SEED_V3 = serializeBinaryState(seedStore.getState());

