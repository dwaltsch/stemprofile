/**
 * Layout, Anti-Collision & Geometry Test Suite
 *
 * Tests badge placement collision avoidance, leader-line anchor physics,
 * and block size recommendation algorithms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLeaderLineAnchor,
  computeClimbBadgeLayout,
  getRecommendedBlockPresets
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
});
