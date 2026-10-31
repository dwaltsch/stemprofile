/**
 * Layout, Anti-Collision & Geometry Test Suite
 *
 * Tests badge placement collision avoidance, leader-line anchor physics,
 * and block size recommendation algorithms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeWaypointLabel,
  calculateLeaderLineAnchor,
  computeClimbBadgeLayout,
  getRecommendedBlockPresets,
  computeBlockPctLayout
} from '../js/layout.js';

describe('Layout Module: Leader Line Anchor Geometry', () => {
  it('connects to bottom edge when badge is above summit apex', () => {
    const badge = { x: 50, y: 10, w: 20, h: 4 };
    const summit = { x: 60, y: 25 }; // Summit apex is below badge

    const anchor = calculateLeaderLineAnchor(badge, summit);
    assert.equal(anchor.connX, 60); // Centered horizontally
    assert.equal(anchor.connY, 14); // Bottom edge of badge (10 + 4)
    assert.ok(anchor.isVisible);
  });

  it('connects to top edge when badge is below apex', () => {
    const badge = { x: 50, y: 30, w: 20, h: 4 };
    const summit = { x: 60, y: 20 }; // Summit apex is above badge

    const anchor = calculateLeaderLineAnchor(badge, summit);
    assert.equal(anchor.connX, 60);
    assert.equal(anchor.connY, 30); // Top edge of badge
    assert.ok(anchor.isVisible);
  });

  it('connects to side edge when badge is horizontally flanking apex', () => {
    const badge = { x: 20, y: 18, w: 10, h: 4 };
    const summit = { x: 35, y: 20 }; // Flanking right

    const anchor = calculateLeaderLineAnchor(badge, summit);
    assert.equal(anchor.connX, 30); // Right edge (20 + 10)
    assert.equal(anchor.connY, 20); // Midpoint vertically (18 + 2)
  });
});

describe('Layout Module: Anti-Collision Badge Placement', () => {
  it('staggers adjacent climb badges to avoid visual collisions', () => {
    const climbs = [
      { id: 1, category: 'Cat 1', summitKm: 20, summitEle: 1200, lengthKm: 10, avgGrade: 7.5 },
      { id: 2, category: 'Cat 2', summitKm: 23, summitEle: 1400, lengthKm: 6, avgGrade: 8.0 }
    ];

    const toX = distM => 10 + (distM / 100000) * 100;
    const toY = eleM => 30 - (eleM / 2000) * 20;

    const badges = computeClimbBadgeLayout(climbs, toX, toY, 5, 5, 2, 33, 110);
    assert.equal(badges.length, 2);

    // Badges must not directly overlap
    const b1 = badges[0];
    const b2 = badges[1];
    const overlaps = (b1.x < b2.x + b2.w && b1.x + b1.w > b2.x) && (b1.y < b2.y + b2.h && b1.y + b1.h > b2.y);
    assert.ok(!overlaps, 'Badges should be placed without overlapping');
  });

  it('respects user-specified custom dragged coordinates', () => {
    const climbs = [
      { id: 1, category: 'HC', summitKm: 50, summitEle: 2000, lengthKm: 15, avgGrade: 8.5 }
    ];
    const customPositions = {
      'climb-1': { x: 42.5, y: 8.5 }
    };

    const toX = distM => distM / 1000;
    const toY = eleM => eleM / 100;

    const badges = computeClimbBadgeLayout(climbs, toX, toY, 5, 5, 2, 33, 110, [], customPositions);
    assert.equal(badges.length, 1);
    assert.equal(badges[0].x, 42.5);
    assert.equal(badges[0].y, 8.5);
  });
});

describe('Layout Module: Block Size Recommendations', () => {
  it('recommends 500m blocks for short stages (<40km)', () => {
    const rec = getRecommendedBlockPresets(30000);
    assert.equal(rec.defaultBlockM, 500);
  });

  it('recommends 1000m blocks for medium stages (40-100km)', () => {
    const rec = getRecommendedBlockPresets(75000);
    assert.equal(rec.defaultBlockM, 1000);
  });

  it('recommends 2000m blocks for long stages (100-180km)', () => {
    const rec = getRecommendedBlockPresets(140000);
    assert.equal(rec.defaultBlockM, 2000);
  });

  it('recommends 5000m blocks for ultra-endurance stages (>180km)', () => {
    const rec = getRecommendedBlockPresets(240000);
    assert.equal(rec.defaultBlockM, 5000);
  });

  it('adapts recommended block size based on physical sticker dimensions', () => {
    // 75km on a compact 75mm stem sticker -> recommends 2000m blocks for clarity
    const compactRec = getRecommendedBlockPresets(75000, 75, 30);
    assert.equal(compactRec.defaultBlockM, 2000);

    // 75km on a long 140mm top tube sticker -> recommends 1000m blocks for high detail
    const longRec = getRecommendedBlockPresets(75000, 140, 35);
    assert.equal(longRec.defaultBlockM, 1000);
  });
});

describe('Layout Module: Dynamic In-Block Percentage Engine', () => {
  it('renders horizontal text with scaled font on wide block columns', () => {
    const block = { absGrade: 8.4, zone: 2 };
    const res = computeBlockPctLayout({
      block,
      idx: 0,
      baseStride: 1,
      blockWidthMm: 4.5,
      colHeight: 12.0,
      topMidY: 15.0,
      yBase: 27.0,
      midX: 20.0,
      lastRenderedTextX: -999,
      widthMm: 110,
      heightMm: 35,
      themeKey: 'white'
    });

    assert.ok(res.shouldRender);
    assert.ok(res.markup.includes('8%'));
    assert.ok(res.markup.includes('font-size="1.75"'));
    assert.equal(res.nextRenderedTextX, 20.0);
  });

  it('scales down font size on compact stem stickers (75x28mm)', () => {
    const block = { absGrade: 10.2, zone: 2 };
    const res = computeBlockPctLayout({
      block,
      idx: 0,
      baseStride: 1,
      blockWidthMm: 3.5,
      colHeight: 8.0,
      topMidY: 10.0,
      yBase: 18.0,
      midX: 15.0,
      lastRenderedTextX: -999,
      widthMm: 75,
      heightMm: 28,
      themeKey: 'white'
    });

    assert.ok(res.shouldRender);
    assert.ok(res.markup.includes('10%'));
    // Scaled font size should be < 1.75
    assert.ok(/font-size="1\.[0-6][0-9]?"/.test(res.markup));
  });

  it('rotates numerals vertically on medium-narrow tall climb columns', () => {
    const block = { absGrade: 12.0, zone: 3 };
    const res = computeBlockPctLayout({
      block,
      idx: 0,
      baseStride: 1,
      blockWidthMm: 1.8,
      colHeight: 9.0,
      topMidY: 10.0,
      yBase: 19.0,
      midX: 30.0,
      lastRenderedTextX: -999,
      widthMm: 110,
      heightMm: 35,
      themeKey: 'white'
    });

    assert.ok(res.shouldRender);
    assert.ok(res.markup.includes('rotate(-90'));
  });

  it('prioritizes steep climbs over flat segments when spacing is tight', () => {
    const steepBlock = { absGrade: 9.0, zone: 2 };
    const res = computeBlockPctLayout({
      block: steepBlock,
      idx: 1,
      baseStride: 2,
      blockWidthMm: 2.2,
      colHeight: 8.0,
      topMidY: 12.0,
      yBase: 20.0,
      midX: 23.0,
      lastRenderedTextX: 20.5, // Tight spacing (2.5mm delta)
      widthMm: 110,
      heightMm: 35,
      themeKey: 'white'
    });

    assert.ok(res.shouldRender, 'Steep pitch (>=5%) should render with prioritized spacing');
  });

  it('handles empty climbs array and zero distance gracefully', () => {
    const emptyBadges = computeClimbBadgeLayout([], dist => dist, ele => ele, 5, 5, 2, 33, 110);
    assert.deepEqual(emptyBadges, []);

    const nullBadges = computeClimbBadgeLayout(null, dist => dist, ele => ele, 5, 5, 2, 33, 110);
    assert.deepEqual(nullBadges, []);

    const zeroDistRec = getRecommendedBlockPresets(0);
    assert.equal(zeroDistRec.defaultBlockM, 500);
    assert.ok(zeroDistRec.options.length >= 3);
  });

  it('does not render percentage labels on very flat/low height columns', () => {
    const flatBlock = { absGrade: 1.0, zone: 0 };
    const res = computeBlockPctLayout({
      block: flatBlock,
      idx: 0,
      baseStride: 1,
      blockWidthMm: 3.5,
      colHeight: 0.5, // extremely low column
      topMidY: 26.5,
      yBase: 27.0,
      midX: 20.0,
      lastRenderedTextX: -999,
      widthMm: 110,
      heightMm: 35,
      themeKey: 'white'
    });

    assert.equal(res.shouldRender, false);
    assert.equal(res.markup, '');
  });

  it('renders signed negative percentage on downhill blocks', () => {
    const downhillBlock = { grade: -3.8, absGrade: 3.8, zone: 0 };
    const res = computeBlockPctLayout({
      block: downhillBlock,
      idx: 0,
      baseStride: 1,
      blockWidthMm: 4.5,
      colHeight: 12.0,
      topMidY: 15.0,
      yBase: 27.0,
      midX: 20.0,
      lastRenderedTextX: -999,
      widthMm: 110,
      heightMm: 35,
      themeKey: 'white'
    });

    assert.ok(res.shouldRender);
    assert.ok(res.markup.includes('-4%'), `Expected -4%, got: ${res.markup}`);
  });

  it('renders 0% without negative zero sign on false-flat downhills', () => {
    const gentleDownhill = { grade: -0.2, absGrade: 0.2, zone: 0 };
    const res = computeBlockPctLayout({
      block: gentleDownhill,
      idx: 0,
      baseStride: 1,
      blockWidthMm: 4.5,
      colHeight: 12.0,
      topMidY: 15.0,
      yBase: 27.0,
      midX: 20.0,
      lastRenderedTextX: -999,
      widthMm: 110,
      heightMm: 35,
      themeKey: 'white'
    });

    assert.ok(res.shouldRender);
    assert.ok(res.markup.includes('>0%<'), `Expected 0%, got: ${res.markup}`);
    assert.ok(!res.markup.includes('>-0%<'), `Should not contain -0%`);
  });
});


describe('Waypoint Label Placement', () => {
  const base = { pinR: 2, tagW: 20, tagH: 2.6, preferAbove: false, W: 110, minY: 5.8, maxY: 34, obstacles: [] };
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  it('keeps the preferred spot when it is free', () => {
    const placed = placeWaypointLabel({ ...base, pinX: 55, pinYs: [15, 10], pinDxs: [0, 6] });
    assert.equal(placed.pinX, 55);
    assert.equal(placed.pinY, 15);
    assert.equal(placed.tagX, -10);
  });

  it('moves pin and label clear of a climb badge', () => {
    const badge = { x: 40, y: 12, w: 30, h: 8 };
    const placed = placeWaypointLabel({ ...base, pinX: 55, pinYs: [15, 25], pinDxs: [0, -6, 6], obstacles: [badge] });
    assert.ok(placed.boxes.every(box => !overlaps(box, badge)));
  });

  it('never moves a pin the user dragged', () => {
    const badge = { x: 40, y: 12, w: 30, h: 8 };
    const placed = placeWaypointLabel({ ...base, pinX: 55, pinYs: [15], obstacles: [badge] });
    assert.equal(placed.pinX, 55);
    assert.equal(placed.pinY, 15);
  });

  it('prefers staying below the header over dodging a badge', () => {
    const badge = { x: 40, y: 8, w: 30, h: 8 };
    const placed = placeWaypointLabel({ ...base, pinX: 55, pinYs: [10, 3], obstacles: [badge] });
    assert.equal(placed.pinY, 10);
  });

  it('keeps its leader line off a climb badge when another spot is free', () => {
    const badge = { x: 50, y: 10, w: 10, h: 12 };
    const spot = placeWaypointLabel({
      ...base, tagW: 6, pinX: 55, pinYs: [8], pinDxs: [0, -12, 12], apex: { x: 55, y: 30 }, obstacles: [badge]
    });
    assert.notEqual(spot.pinX, 55);
  });

  it('avoids terrain when the air above is free', () => {
    const spot = placeWaypointLabel({ ...base, pinX: 55, pinYs: [28, 12], terrainY: () => 20 });
    assert.equal(spot.pinY, 12);
  });

  it('stays on the sticker near both edges', () => {
    for (const pinX of [1, 109]) {
      const { pinX: x, tagX } = placeWaypointLabel({ ...base, pinX, pinYs: [15] });
      assert.ok(x + tagX >= 0.8 && x + tagX + base.tagW <= base.W - 0.8);
    }
  });
});

describe('Climb Badge Crowding', () => {
  const toX = (dist) => 5 + dist / 1000;
  const toY = (ele) => 30 - ele / 100;
  const climb = (id, summitKm) => ({ id, category: 'HC', summitKm, summitEle: 1500, lengthKm: 12.3, avgGrade: 7.1 });

  it('shrinks badges to the category pill when full ones do not fit near the summit', () => {
    const climbs = Array.from({ length: 12 }, (_, i) => climb(i, 5 + i * 8));
    const badges = computeClimbBadgeLayout(climbs, toX, toY, 5, 5, 5.8, 29, 110);
    assert.ok(badges.some(b => b.w === b.catW));
    assert.ok(badges.some(b => b.w > b.catW));
  });

  it('keeps badges off the summit dots of later climbs', () => {
    const climbs = [climb(1, 40), climb(2, 52)];
    climbs[1].summitEle = 2000;
    const [first] = computeClimbBadgeLayout(climbs, toX, toY, 5, 5, 5.8, 29, 110);
    const dot = { x: toX(52000), y: toY(2000) };
    const covers = first.x < dot.x + 1.5 && first.x + first.w > dot.x - 1.5 && first.y < dot.y + 1.5 && first.y + first.h > dot.y - 1.5;
    assert.equal(covers, false);
  });
});
