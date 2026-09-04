/**
 * Export & Print Module Test Suite
 *
 * Tests precision print sheet generation, corner crop marks geometry,
 * 50mm scale calibration check ruler, multi-copies layout, and theme preservation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRINT_CONFIG,
  PAPER_DIMENSIONS,
  generateCropMarksSVG,
  generateCalibrationRulerSVG,
  generatePrintSheetMarkup,
  resolveExportParams
} from '../js/export.js';
import { processTrackSignal } from '../js/signal.js';
import { DEFAULT_SETTINGS } from '../js/share.js';
import { THEMES } from '../js/renderer.js';

describe('Export & Print Module: Configuration & Geometry', () => {
  it('defines valid default print configuration', () => {
    assert.equal(DEFAULT_PRINT_CONFIG.copies, 2);
    assert.equal(DEFAULT_PRINT_CONFIG.printTheme, 'theme');
    assert.equal(DEFAULT_PRINT_CONFIG.showCropMarks, true);
    assert.equal(DEFAULT_PRINT_CONFIG.showCutLines, true);
    assert.equal(DEFAULT_PRINT_CONFIG.showRuler, true);
    assert.equal(DEFAULT_PRINT_CONFIG.showHeader, true);
    assert.equal(DEFAULT_PRINT_CONFIG.paper, 'a4');
    assert.equal(DEFAULT_PRINT_CONFIG.orientation, 'auto');
  });

  it('defines standard paper format dimensions', () => {
    assert.equal(PAPER_DIMENSIONS.a4.widthMm, 210);
    assert.equal(PAPER_DIMENSIONS.a4.heightMm, 297);
    assert.equal(PAPER_DIMENSIONS.letter.widthMm, 215.9);
    assert.equal(PAPER_DIMENSIONS.letter.heightMm, 279.4);
  });

  it('generates precision corner crop marks with valid coordinates', () => {
    const W = 110;
    const H = 35;
    const offset = 3.5;
    const svg = generateCropMarksSVG(W, H, offset, 4);

    assert.ok(svg.includes('class="crop-marks"'));
    assert.ok(svg.includes('<line'));
    // Contains corner ticks and center ticks
    assert.ok(svg.includes(`x1="${offset}"`));
    assert.ok(svg.includes(`x1="${offset + W}"`));
    assert.ok(svg.includes(`y1="${offset + H}"`));
  });

  it('generates 50mm and 2-inch calibration check ruler', () => {
    const rulerSvg = generateCalibrationRulerSVG(140);

    assert.ok(rulerSvg.includes('class="print-calibration-bar"'));
    assert.ok(rulerSvg.includes('50 mm Metric Scale'));
    assert.ok(rulerSvg.includes('2.0 in Imperial Scale'));
    assert.ok(rulerSvg.includes('100% Physical Size Check'));
    assert.ok(rulerSvg.includes('viewBox="0 0 140 9"'));
  });
});

describe('Export & Print Module: Sheet Markup Generation', () => {
  const sampleCoords = [
    { lat: 45.832, lon: 6.865, ele: 1000 },
    { lat: 45.840, lon: 6.875, ele: 1800 },
    { lat: 45.855, lon: 6.890, ele: 2400 }
  ];
  const { points, stats, climbs, blocks } = processTrackSignal(sampleCoords, 3, 1000);

  it('generates multi-sticker sheet with requested copy count', () => {
    const state = {
      points,
      stats,
      climbs,
      blocks,
      waypoints: [],
      settings: { ...DEFAULT_SETTINGS, title: 'Mont Blanc Stage', widthMm: 110, heightMm: 35 }
    };

    const sheet4 = generatePrintSheetMarkup(state, { copies: 4 });
    assert.equal(sheet4.count, 4);
    assert.ok(sheet4.html.includes('class="print-sheet-wrapper"'));
    assert.ok(sheet4.html.includes('Mont Blanc Stage'));

    // Count occurrences of print-sheet-cell
    const cellMatches = sheet4.html.match(/class="print-sheet-cell"/g);
    assert.equal(cellMatches.length, 4);
  });

  it('preserves active sticker theme when printTheme is "theme"', () => {
    const state = {
      points,
      stats,
      climbs,
      blocks,
      waypoints: [],
      settings: { ...DEFAULT_SETTINGS, theme: 'giro' }
    };

    const result = generatePrintSheetMarkup(state, { printTheme: 'theme' });
    assert.ok(result.html.includes(`background:${THEMES.giro.bg}`));
  });

  it('forces ink-saving white palette when printTheme is "white"', () => {
    const state = {
      points,
      stats,
      climbs,
      blocks,
      waypoints: [],
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' }
    };

    const result = generatePrintSheetMarkup(state, { printTheme: 'white' });
    assert.ok(result.html.includes(`background:${THEMES.white.bg}`));
  });

  it('scopes gradient IDs uniquely per sticker cell to prevent DOM ID collision', () => {
    const climbsWithBadge = [
      { id: 'c1', startKm: 0.5, endKm: 2.0, summitKm: 2.0, summitEle: 1800, lengthKm: 1.5, avgGrade: 8.5, category: 'Cat 2' }
    ];
    const state = {
      points,
      stats,
      climbs: climbsWithBadge,
      blocks,
      waypoints: [],
      settings: { ...DEFAULT_SETTINGS, printCopies: 2, showClimbs: true }
    };

    const result = generatePrintSheetMarkup(state, { copies: 2 });
    assert.ok(result.html.includes('id="climb-active-grad-sheet-0"'));
    assert.ok(result.html.includes('id="climb-active-grad-sheet-1"'));
    assert.ok(result.html.includes('id="profile-svg-elem-sheet-0"'));
    assert.ok(result.html.includes('id="profile-svg-elem-sheet-1"'));
  });

  it('selectively toggles crop marks, ruler, cut lines, and header', () => {
    const state = {
      points,
      stats,
      climbs,
      blocks,
      waypoints: [],
      settings: { ...DEFAULT_SETTINGS, title: 'Test Header' }
    };

    // All enabled
    const allEnabled = generatePrintSheetMarkup(state, {
      showCropMarks: true,
      showCutLines: true,
      showRuler: true,
      showHeader: true
    });
    assert.ok(allEnabled.html.includes('class="crop-marks"'));
    assert.ok(allEnabled.html.includes('class="print-cell-cut-guide"'));
    assert.ok(allEnabled.html.includes('class="print-sheet-ruler-wrap"'));
    assert.ok(allEnabled.html.includes('class="print-sheet-meta-header"'));

    // All disabled
    const allDisabled = generatePrintSheetMarkup(state, {
      showCropMarks: false,
      showCutLines: false,
      showRuler: false,
      showHeader: false
    });
    assert.ok(!allDisabled.html.includes('class="crop-marks"'));
    assert.ok(!allDisabled.html.includes('class="print-cell-cut-guide"'));
    assert.ok(!allDisabled.html.includes('class="print-sheet-ruler-wrap"'));
    assert.ok(!allDisabled.html.includes('class="print-sheet-meta-header"'));
  });

  it('generates vertical top-tube fueling decal sheet with accurate dimensions', () => {
    const state = {
      points,
      stats,
      climbs: [],
      blocks: [],
      waypoints: [],
      activeView: 'fueling',
      settings: {
        ...DEFAULT_SETTINGS,
        title: 'Fueling Sheet Test',
        fuelingWidthMm: 35,
        fuelingHeightMm: 115
      },
      fueling: {
        mode: 'km',
        items: [
          { id: 'f1', distM: 15000, name: 'Gel 1', carbsG: 25, icon: '⚡' },
          { id: 'f2', distM: 30000, name: 'Bidon Mix', carbsG: 40, icon: '🍾' }
        ]
      }
    };

    const sheet = generatePrintSheetMarkup(state, { copies: 2 });
    assert.equal(sheet.count, 2);
    assert.equal(sheet.stickerW, 35);
    assert.equal(sheet.stickerH, 115);
    assert.ok(sheet.html.includes('id="fueling-svg-elem-sheet-0"'));
    assert.ok(sheet.html.includes('id="fueling-svg-elem-sheet-1"'));
    assert.ok(sheet.html.includes('35 × 115 mm'));
  });
});

describe('Export & Print Module: Polymorphic Parameter Resolution', () => {
  it('correctly resolves options object parameter signature', () => {
    const state = {
      points: [{ distM: 0, ele: 100 }],
      stats: { totalDist: 1000 },
      climbs: [],
      blocks: [],
      waypoints: [],
      settings: { widthMm: 120 }
    };

    const resolved = resolveExportParams(state);
    assert.equal(resolved.points.length, 1);
    assert.equal(resolved.settings.widthMm, 120);
  });

  it('correctly resolves positional arguments signature', () => {
    const points = [{ distM: 0, ele: 100 }];
    const stats = { totalDist: 1000 };
    const climbs = [{ id: 'c1' }];
    const blocks = [];
    const waypoints = [{ id: 'w1' }];
    const settings = { widthMm: 130 };

    const resolved = resolveExportParams(points, stats, climbs, blocks, waypoints, settings);
    assert.equal(resolved.points.length, 1);
    assert.equal(resolved.climbs.length, 1);
    assert.equal(resolved.waypoints.length, 1);
    assert.equal(resolved.settings.widthMm, 130);
  });
});
