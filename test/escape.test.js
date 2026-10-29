/**
 * Markup Escaping & Untrusted Input Test Suite
 *
 * Tests the shared escape helper, shared-link payload sanitization,
 * and that user-controlled strings never reach rendered markup unescaped.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml, escapeHtml } from '../js/escape.js';
import { renderProfileSVG } from '../js/renderer.js';
import { renderFuelingSVG } from '../js/fueling-renderer.js';
import { processTrackSignal } from '../js/signal.js';
import { DEFAULT_SETTINGS, sanitizePayload, normalizePayload } from '../js/share.js';
import { createStore } from '../js/store.js';

const EVIL = `<img src=x onerror="alert('x')">&`;

const coords = [
  { lat: 45.00, lon: 6.00, ele: 500 },
  { lat: 45.05, lon: 6.05, ele: 1000 },
  { lat: 45.10, lon: 6.10, ele: 700 }
];

describe('Escape Module: escapeXml', () => {
  it('escapes all markup-significant characters', () => {
    assert.equal(escapeXml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('handles null, undefined and non-string values', () => {
    assert.equal(escapeXml(null), '');
    assert.equal(escapeXml(undefined), '');
    assert.equal(escapeXml(42), '42');
  });

  it('exposes escapeHtml as the same function', () => {
    assert.equal(escapeHtml, escapeXml);
  });
});

describe('Escape Module: Rendered Markup Contains No Raw User Strings', () => {
  it('escapes route title and waypoint labels in the profile SVG', () => {
    const { points, stats, climbs, blocks } = processTrackSignal(coords, 3, 1000);
    const settings = { ...DEFAULT_SETTINGS, title: EVIL, showHeader: true, showWaypointLabels: true };
    const waypoints = [{ id: 'w1', distM: 1000, type: 'feed', label: EVIL, enabled: true }];

    const svg = renderProfileSVG(points, stats, climbs, blocks, waypoints, settings);
    assert.ok(!svg.includes('<img'), 'raw <img> tag leaked into SVG');
    assert.ok(svg.includes('&lt;img'));
  });

  it('escapes fuel item names and ids in the fueling SVG', () => {
    const store = createStore();
    store.setTrack({ title: EVIL, coords });
    store.addFuelItem({ distM: 500, type: 'gel', name: EVIL, carbsG: 25 });

    const svg = renderFuelingSVG(store.getState());
    assert.ok(!svg.includes('<img'), 'raw <img> tag leaked into fueling SVG');
  });
});

describe('Share Module: sanitizePayload', () => {
  it('drops unknown settings keys and mistyped values', () => {
    const out = sanitizePayload({
      coords,
      settings: { widthMm: '110mm"><script>', heightMm: 40, showHeader: 'yes', theme: 'evil', units: 'imperial', foo: 1 }
    });
    assert.equal(out.settings.widthMm, undefined);
    assert.equal(out.settings.heightMm, 40);
    assert.equal(out.settings.showHeader, undefined);
    assert.equal(out.settings.theme, undefined);
    assert.equal(out.settings.units, 'imperial');
    assert.equal(out.settings.foo, undefined);
  });

  it('constrains waypoint ids, types and labels', () => {
    const out = sanitizePayload({
      coords,
      waypoints: [
        { id: '"><svg onload=alert(1)>', distM: 1200, type: 'nope', label: 'x'.repeat(200) },
        { id: 'ok-id_1', distM: 500, type: 'water', label: 'Bottle', enabled: false },
        { id: 'bad', distM: 'NaN' },
        null
      ]
    });
    assert.equal(out.waypoints.length, 2);
    assert.equal(out.waypoints[0].id, 'wpt-sh-1');
    assert.equal(out.waypoints[0].type, 'feed');
    assert.equal(out.waypoints[0].label.length, 50);
    assert.deepEqual(out.waypoints[1], { id: 'ok-id_1', distM: 500, type: 'water', label: 'Bottle', enabled: false });
  });

  it('keeps only finite custom label positions with safe keys', () => {
    const out = sanitizePayload({
      coords,
      settings: { customPositions: { 'climb-1': { x: 10, y: 5 }, 'bad key"': { x: 1, y: 1 }, 'wpt-a': { x: 'a', y: 1 } } }
    });
    assert.deepEqual(out.settings.customPositions, { 'climb-1': { x: 10, y: 5 } });
  });

  it('returns null for unusable payloads', () => {
    assert.equal(sanitizePayload(null), null);
    assert.equal(sanitizePayload({ coords: 'nope' }), null);
  });

  it('is applied by store.loadPayload for legacy JSON links', () => {
    const legacy = normalizePayload({
      t: 'Legacy',
      coords: [[45, 6, 500], [45.05, 6.05, 900]],
      s: { theme: 'dark', widthMm: '1"/><script>' },
      w: [{ id: '"><b>', distM: 300, type: 'feed', label: 'Feed' }]
    });
    const store = createStore();
    assert.equal(store.loadPayload(legacy), true);
    const state = store.getState();
    assert.equal(state.settings.theme, 'dark');
    assert.equal(state.settings.widthMm, DEFAULT_SETTINGS.widthMm);
    assert.equal(state.settings.title, 'Legacy');
    assert.ok(state.waypoints.every(w => /^[\w-]+$/.test(w.id)));
  });
});
