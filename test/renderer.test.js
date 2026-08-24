/**
 * Vector SVG Renderer Test Suite
 *
 * Tests SVG markup generation, physical millimeter dimensioning,
 * theme palettes, and layout element inclusion.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, WAYPOINT_CONFIG, renderProfileSVG } from '../js/renderer.js';
import { processTrackSignal } from '../js/signal.js';
import { DEFAULT_SETTINGS } from '../js/share.js';

describe('Renderer Module: Theme & Config Validation', () => {
  it('defines valid color palettes for all themes (white, dark, tour, neon, giro, gravel)', () => {
    const themeKeys = ['white', 'dark', 'tour', 'neon', 'giro', 'gravel'];
    const requiredKeys = ['bg', 'text', 'grid', 'topStroke', 'z1', 'z2', 'z3', 'z4'];

    for (const t of themeKeys) {
      assert.ok(THEMES[t], `Missing theme definition for ${t}`);
      for (const key of requiredKeys) {
        assert.ok(THEMES[t][key], `Missing key ${key} in ${t} theme`);
      }
    }
  });

  it('defines waypoint configuration categories with colors and shortcodes', () => {
    const categories = ['feed', 'water', 'food', 'sprint', 'summit', 'caution', 'mech', 'checkpoint'];
    for (const cat of categories) {
      assert.ok(WAYPOINT_CONFIG[cat], `Missing config for ${cat}`);
      assert.ok(WAYPOINT_CONFIG[cat].color, `Missing color for ${cat}`);
      assert.ok(WAYPOINT_CONFIG[cat].shortCode, `Missing shortCode for ${cat}`);
    }
  });
});

describe('Renderer Module: SVG Profile Generation', () => {
  it('generates well-formed SVG string matching requested physical dimensions', () => {
    const coords = [
      { lat: 45.00, lon: 6.00, ele: 500 },
      { lat: 45.05, lon: 6.05, ele: 1000 },
      { lat: 45.10, lon: 6.10, ele: 700 }
    ];

    const { points, stats, climbs, blocks } = processTrackSignal(coords, 3, 1000);

    const settings = {
      ...DEFAULT_SETTINGS,
      title: 'Col du Galibier',
      widthMm: 110,
      heightMm: 35,
      radiusMm: 2,
      theme: 'white',
      showHeader: true,
      showCutGuidelines: true
    };

    const waypoints = [
      { id: 'w1', distM: 1000, type: 'feed', label: 'Feed 1', enabled: true }
    ];

    const svg = renderProfileSVG(points, stats, climbs, blocks, waypoints, settings);

    // Verify root SVG structure and viewBox
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(svg.includes('viewBox="0 0 110 35"'));
    assert.ok(svg.includes('width="110mm"'));
    assert.ok(svg.includes('height="35mm"'));

    // Verify header title and gradient definitions
    assert.ok(svg.includes('Col du Galibier'));
    assert.ok(svg.includes('linearGradient id="climb-active-grad"'));

    // Verify cut guidelines presence
    assert.ok(svg.includes('stroke-dasharray="1,1"'));

    // Verify waypoint rendered
    assert.ok(svg.includes('Feed 1') || svg.includes('FEED'));
  });

  it('selectively hides climb summit badges when specified in hiddenClimbIds', () => {
    const coords = [];
    for (let i = 0; i < 200; i++) {
      let ele = 300;
      if (i >= 30 && i <= 80) ele = 300 + (i - 30) * 20; // Climb 1
      if (i > 80 && i <= 100) ele = 1300 - (i - 80) * 20;
      if (i >= 120 && i <= 170) ele = 900 + (i - 120) * 20; // Climb 2
      if (i > 170) ele = 1900 - (i - 170) * 20;
      coords.push({ lat: 45.0 + i * 0.002, lon: 6.0 + i * 0.002, ele });
    }

    const { points, stats, climbs, blocks } = processTrackSignal(coords, 3, 1000);
    assert.ok(climbs.length >= 2, 'Should detect at least 2 climbs');

    const climb1Id = climbs[0].id;
    const climb2Id = climbs[1].id;

    // Render with climb 1 hidden
    const settings = {
      ...DEFAULT_SETTINGS,
      showClimbs: true,
      hiddenClimbIds: [climb1Id]
    };

    const svg = renderProfileSVG(points, stats, climbs, blocks, [], settings);
    assert.ok(!svg.includes(`data-drag-id="climb-${climb1Id}"`), 'Hidden climb badge should not be rendered');
    assert.ok(svg.includes(`data-drag-id="climb-${climb2Id}"`), 'Visible climb badge should be rendered');
  });

  it('handles empty or minimal point sets without throwing', () => {
    const svg = renderProfileSVG([], null, [], [], [], DEFAULT_SETTINGS);
    assert.ok(typeof svg === 'string' && svg.includes('<svg'));
  });
});
