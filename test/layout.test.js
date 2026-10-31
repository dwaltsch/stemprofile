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
  computeBlockPctLabels
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

describe('Layout Module: In-Block Percentage Labels', () => {
  const yBase = 30;
  // A ramp profile: tall columns rising to the right, with grades given per block
  const columnsFrom = (grades, widthEach = 2, top = 5) => grades.map((grade, i) => ({
    block: { grade, zone: Math.abs(grade) >= 8 ? 3 : 1 },
    x1: 10 + i * widthEach,
    x2: 10 + (i + 1) * widthEach,
    y1: top,
    y2: top
  }));
  const labelsFor = (columns, extra = {}) => computeBlockPctLabels(columns, { yBase, ...extra });
  const attr = (label, name) => label.markup.match(new RegExp(`${name}="([^"]+)"`))[1];

  it('gives every label the same baseline, size and orientation', () => {
    const labels = labelsFor(columnsFrom([2, 5, 9, 12, -3, -8, 1, 6, 10, 4, 0, -11]));
    assert.ok(labels.length >= 4);
    assert.equal(new Set(labels.map(l => attr(l, 'y'))).size, 1);
    assert.equal(new Set(labels.map(l => attr(l, 'font-size'))).size, 1);
    assert.equal(new Set(labels.map(l => l.markup.includes('rotate('))).size, 1);
  });

  it('labels the steepest climbs before gentle or flat blocks', () => {
    const texts = labelsFor(columnsFrom([1, 2, 12, 3, 1, 0, 2, 11, 1, 2])).map(l => l.text);
    assert.equal(texts[0], '12%');
    assert.ok(texts.includes('11%'));
  });

  it('leaves near-flat blocks unlabeled relative to the steepest ramp', () => {
    const texts = labelsFor(columnsFrom([0, 12, 2, 0, 5, 1], 4)).map(l => l.text);
    assert.deepEqual(texts.sort(), ['12%', '5%']);
    assert.deepEqual(labelsFor(columnsFrom([0, 0, 0], 4)), []);
    assert.equal(labelsFor(columnsFrom([0, 2, 0], 4))[0].text, '2%');
  });

  it('prefers a climb over an equally steep descent', () => {
    const [first] = labelsFor(columnsFrom([-9, 9]));
    assert.equal(first.text, '9%');
  });

  it('keeps labels apart and under the profile line', () => {
    const columns = columnsFrom([9, 9, 9, 9, 9, 9, 9, 9], 1.5);
    const labels = labelsFor(columns);
    const sorted = labels.map(l => l.box).sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].x >= sorted[i - 1].x + sorted[i - 1].w);
    assert.equal(labelsFor(columnsFrom([9, 9], 2, 29)).length, 0);
  });

  it('uses horizontal text only when blocks are wide enough', () => {
    assert.ok(!labelsFor(columnsFrom([8, 4], 5))[0].markup.includes('rotate('));
    assert.ok(labelsFor(columnsFrom([8, 4], 2))[0].markup.includes('rotate('));
    assert.deepEqual(labelsFor(columnsFrom([8, 4], 0.2)), []);
  });

  it('skips blocks hidden by an overlay', () => {
    const labels = labelsFor(columnsFrom([8, 4, 6, 5]), { isCovered: box => box.x < 13 });
    assert.ok(labels.every(l => l.box.x >= 13));
  });

  it('reads light text on steep zones and dark text on pale zones of light themes', () => {
    assert.equal(attr(labelsFor(columnsFrom([12]))[0], 'fill'), '#ffffff');
    assert.equal(attr(labelsFor(columnsFrom([3]))[0], 'fill'), '#000000');
    assert.equal(attr(labelsFor(columnsFrom([3]), { themeKey: 'dark' })[0], 'fill'), '#ffffff');
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
