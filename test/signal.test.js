/**
 * Signal Processing Test Suite
 *
 * Tests geospatial calculations, elevation smoothing, spatial discretization,
 * UCI climb categorization, and waypoint classification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcHaversine,
  getInterpolatedEle,
  buildSpatialBlocks,
  detectClimbs,
  processTrackSignal,
  matchWaypointsToTrack,
  EARTH_RADIUS_METERS
} from '../js/signal.js';

describe('Signal Module: Geodesy & Interpolation', () => {
  it('computes zero distance for identical coordinates', () => {
    const d1 = calcHaversine(45.0, 6.0, 45.0, 6.0);
    assert.equal(d1, 0);
    const d2 = calcHaversine(90.0, 0.0, 90.0, 0.0);
    assert.equal(d2, 0);
    const d3 = calcHaversine(-90.0, 180.0, -90.0, 180.0);
    assert.equal(d3, 0);
  });

  it('computes exact distance for antipodal coordinates without NaN', () => {
    // North pole to South pole: half earth circumference = PI * R ~ 20015086m
    const dPoles = calcHaversine(90.0, 0.0, -90.0, 0.0);
    assert.ok(!isNaN(dPoles));
    assert.ok(Math.abs(dPoles - Math.PI * EARTH_RADIUS_METERS) < 1.0);

    // Opposite sides of equator: (0, 0) to (0, 180)
    const dEquator = calcHaversine(0.0, 0.0, 0.0, 180.0);
    assert.ok(!isNaN(dEquator));
    assert.ok(Math.abs(dEquator - Math.PI * EARTH_RADIUS_METERS) < 1.0);
  });

  it('computes accurate Haversine distance (~1000m)', () => {
    // 1 degree longitude at equator is ~111.32 km
    // 0.008983 degrees latitude is ~1000m
    const d = calcHaversine(0.0, 0.0, 0.008983, 0.0);
    assert.ok(Math.abs(d - 1000) < 5, `Expected ~1000m, got ${d}`);
  });

  it('interpolates elevation smoothly between profile points', () => {
    const points = [
      { dist: 0, smoothEle: 100 },
      { dist: 1000, smoothEle: 200 },
      { dist: 2000, smoothEle: 400 }
    ];

    assert.equal(getInterpolatedEle(points, 0), 100);
    assert.equal(getInterpolatedEle(points, 500), 150); // Midpoint of 100 and 200
    assert.equal(getInterpolatedEle(points, 1000), 200);
    assert.equal(getInterpolatedEle(points, 1500), 300); // Midpoint of 200 and 400
    assert.equal(getInterpolatedEle(points, 2000), 400);

    // Boundary conditions
    assert.equal(getInterpolatedEle(points, -100), 100);
    assert.equal(getInterpolatedEle(points, 3000), 400);
  });
});

describe('Signal Module: Spatial Discretization', () => {
  it('segments track into uniform spatial block columns', () => {
    // 3000m route climbing 300m linearly (10% constant grade)
    const points = [
      { dist: 0, smoothEle: 0 },
      { dist: 1000, smoothEle: 100 },
      { dist: 2000, smoothEle: 200 },
      { dist: 3000, smoothEle: 300 }
    ];

    const blocks = buildSpatialBlocks(points, 3000, 1000);
    assert.equal(blocks.length, 3);

    // Block 1
    assert.equal(blocks[0].index, 1);
    assert.equal(blocks[0].startDist, 0);
    assert.equal(blocks[0].endDist, 1000);
    assert.equal(blocks[0].lengthM, 1000);
    assert.equal(blocks[0].grade, 10.0);
    assert.equal(blocks[0].zone, 2); // Zone 3 (8-12%) is zone index 2

    // Block 2
    assert.equal(blocks[1].index, 2);
    assert.equal(blocks[1].grade, 10.0);

    // Block 3
    assert.equal(blocks[2].index, 3);
    assert.equal(blocks[2].grade, 10.0);
  });

  it('assigns correct gradient color zones', () => {
    // Flat: 2% (Zone 0)
    // Moderate: 6% (Zone 1)
    // Steep: 10% (Zone 2)
    // Severe: 15% (Zone 3)
    const points = [
      { dist: 0, smoothEle: 0 },
      { dist: 1000, smoothEle: 20 },   // 2% -> zone 0
      { dist: 2000, smoothEle: 80 },   // 6% -> zone 1
      { dist: 3000, smoothEle: 180 },  // 10% -> zone 2
      { dist: 4000, smoothEle: 330 }   // 15% -> zone 3
    ];

    const blocks = buildSpatialBlocks(points, 4000, 1000);
    assert.equal(blocks.length, 4);
    assert.equal(blocks[0].zone, 0);
    assert.equal(blocks[1].zone, 1);
    assert.equal(blocks[2].zone, 2);
    assert.equal(blocks[3].zone, 3);
  });
});

describe('Signal Module: UCI Climb Detection', () => {
  it('detects and categorizes sustained Hors Catégorie (HC) climbs', () => {
    // 15 km climb with 1200m elevation gain (8% avg grade)
    // Score = 15 * 8^2 = 960 (Score >= 600 -> HC)
    const points = [];
    for (let i = 0; i <= 150; i++) {
      const dist = i * 100;
      const smoothEle = (dist / 15000) * 1200;
      const grade = 8.0;
      points.push({ dist, smoothEle, rawEle: smoothEle, grade, zone: 2 });
    }

    const climbs = detectClimbs(points);
    assert.ok(climbs.length >= 1, 'Should detect HC climb');
    assert.equal(climbs[0].category, 'HC');
    assert.equal(climbs[0].gainM, 1200);
    assert.equal(climbs[0].avgGrade, 8.0);
  });

  it('detects and categorizes Category 1 climbs', () => {
    // 8 km climb with 560m elevation gain (7% avg grade)
    // Score = 8 * 7^2 = 392 (300 <= Score < 600 -> Cat 1)
    const points = [];
    for (let i = 0; i <= 80; i++) {
      const dist = i * 100;
      const smoothEle = (dist / 8000) * 560;
      const grade = 7.0;
      points.push({ dist, smoothEle, rawEle: smoothEle, grade, zone: 1 });
    }

    const climbs = detectClimbs(points);
    assert.ok(climbs.length >= 1, 'Should detect Cat 1 climb');
    assert.equal(climbs[0].category, 'Cat 1');
    assert.equal(climbs[0].gainM, 560);
    assert.equal(climbs[0].avgGrade, 7.0);
  });

  it('detects and categorizes Category 2 climbs', () => {
    // 4 km climb with 280m elevation gain (7% avg grade)
    // Score = 4 * 7^2 = 196 (150 <= Score < 300 -> Cat 2)
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const dist = i * 100;
      const smoothEle = (dist / 4000) * 280;
      const grade = 7.0;
      points.push({ dist, smoothEle, rawEle: smoothEle, grade, zone: 1 });
    }

    const climbs = detectClimbs(points);
    assert.ok(climbs.length >= 1, 'Should detect Cat 2 climb');
    assert.equal(climbs[0].category, 'Cat 2');
    assert.equal(climbs[0].gainM, 280);
    assert.equal(climbs[0].avgGrade, 7.0);
  });

  it('detects and categorizes Category 3 climbs', () => {
    // 2 km climb with 140m elevation gain (7% avg grade)
    // Score = 2 * 7^2 = 98 (75 <= Score < 150 -> Cat 3)
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const dist = i * 100;
      const smoothEle = (dist / 2000) * 140;
      const grade = 7.0;
      points.push({ dist, smoothEle, rawEle: smoothEle, grade, zone: 1 });
    }

    const climbs = detectClimbs(points);
    assert.ok(climbs.length >= 1, 'Should detect Cat 3 climb');
    assert.equal(climbs[0].category, 'Cat 3');
    assert.equal(climbs[0].gainM, 140);
    assert.equal(climbs[0].avgGrade, 7.0);
  });

  it('detects and categorizes Category 4 climbs', () => {
    // 1.2 km climb with 66m elevation gain (5.5% avg grade)
    // Score = 1.2 * 5.5^2 = 36.3 (20 <= Score < 75 -> Cat 4)
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const dist = i * 50;
      const smoothEle = (dist / 1200) * 66;
      const grade = 5.5;
      points.push({ dist, smoothEle, rawEle: smoothEle, grade, zone: 1 });
    }

    const climbs = detectClimbs(points);
    assert.ok(climbs.length >= 1, 'Should detect Cat 4 climb');
    assert.equal(climbs[0].category, 'Cat 4');
    assert.equal(climbs[0].gainM, 66);
    assert.equal(climbs[0].avgGrade, 5.5);
  });

  it('rejects minor bumps below minimum length or gradient threshold', () => {
    // 200m at 2% grade
    const points = [
      { dist: 0, smoothEle: 100, rawEle: 100, grade: 2.0, zone: 0 },
      { dist: 50, smoothEle: 101, rawEle: 101, grade: 2.0, zone: 0 },
      { dist: 100, smoothEle: 102, rawEle: 102, grade: 2.0, zone: 0 },
      { dist: 150, smoothEle: 103, rawEle: 103, grade: 2.0, zone: 0 },
      { dist: 200, smoothEle: 104, rawEle: 104, grade: 2.0, zone: 0 }
    ];

    const climbs = detectClimbs(points);
    assert.equal(climbs.length, 0);
  });
});

describe('Signal Module: Track Processing Pipeline', () => {
  it('processes track signal and computes valid telemetry statistics', () => {
    const rawCoords = [
      { lat: 45.000, lon: 6.000, ele: 500 },
      { lat: 45.005, lon: 6.000, ele: 550 },
      { lat: 45.010, lon: 6.000, ele: 600 },
      { lat: 45.015, lon: 6.000, ele: 580 },
      { lat: 45.020, lon: 6.000, ele: 700 }
    ];

    const { points, stats, blocks } = processTrackSignal(rawCoords, 3, 500);

    assert.equal(points.length, 5);
    assert.ok(stats !== null);
    assert.ok(stats.totalDist > 0);
    assert.ok(stats.elevGain > 0);
    assert.ok(stats.minEle >= 500);
    assert.ok(stats.maxEle <= 700);
    assert.ok(blocks.length > 0);
  });

  it('handles completely flat tracks with zero elevation gain and zero climbs', () => {
    const flatCoords = [
      { lat: 45.000, lon: 6.000, ele: 250 },
      { lat: 45.005, lon: 6.000, ele: 250 },
      { lat: 45.010, lon: 6.000, ele: 250 },
      { lat: 45.015, lon: 6.000, ele: 250 }
    ];

    const { points, stats, climbs, blocks } = processTrackSignal(flatCoords, 3, 500);
    assert.equal(points.length, 4);
    assert.equal(stats.elevGain, 0);
    assert.equal(stats.elevLoss, 0);
    assert.equal(stats.minEle, 250);
    assert.equal(stats.maxEle, 250);
    assert.equal(stats.maxGrade, 0);
    assert.equal(climbs.length, 0);
    for (const b of blocks) {
      assert.equal(b.grade, 0);
      assert.equal(b.absGrade, 0);
      assert.equal(b.zone, 0);
    }
  });

  it('handles zero-distance routes where all points have identical coordinates without NaN', () => {
    const zeroDistCoords = [
      { lat: 45.000, lon: 6.000, ele: 100 },
      { lat: 45.000, lon: 6.000, ele: 100 },
      { lat: 45.000, lon: 6.000, ele: 100 }
    ];

    const { points, stats, climbs, blocks } = processTrackSignal(zeroDistCoords, 3, 500);
    assert.equal(points.length, 3);
    assert.equal(stats.totalDist, 0);
    assert.equal(stats.elevGain, 0);
    assert.equal(stats.maxGrade, 0);
    assert.equal(climbs.length, 0);
    assert.equal(blocks.length, 0);
    for (const p of points) {
      assert.ok(!isNaN(p.grade));
      assert.equal(p.grade, 0);
    }
  });
});

describe('Signal Module: Waypoint Classification', () => {
  it('correctly classifies waypoints based on semantic keywords', () => {
    const rawWaypoints = [
      { lat: 45.000, lon: 6.000, name: 'Water Fountain', sym: 'Water', desc: '', typeStr: '' },
      { lat: 45.005, lon: 6.000, name: 'Feed Zone 1', sym: 'Food', desc: 'Ravito', typeStr: '' },
      { lat: 45.010, lon: 6.000, name: 'Col du Galibier', sym: 'Summit', desc: 'Pass 2642m', typeStr: '' },
      { lat: 45.015, lon: 6.000, name: 'Sprint Intermédiaire', sym: 'Sprint', desc: '', typeStr: '' },
      { lat: 45.020, lon: 6.000, name: 'Danger Cobbles', sym: 'Caution', desc: 'Pave sector', typeStr: '' }
    ];

    const coords = [
      { lat: 45.000, lon: 6.000 },
      { lat: 45.005, lon: 6.000 },
      { lat: 45.010, lon: 6.000 },
      { lat: 45.015, lon: 6.000 },
      { lat: 45.020, lon: 6.000 }
    ];

    const points = [
      { dist: 0 },
      { dist: 500 },
      { dist: 1000 },
      { dist: 1500 },
      { dist: 2000 }
    ];

    const matched = matchWaypointsToTrack(rawWaypoints, coords, points);
    assert.equal(matched.length, 5);
    assert.equal(matched[0].type, 'water');
    assert.equal(matched[1].type, 'feed');
    assert.equal(matched[2].type, 'summit');
    assert.equal(matched[3].type, 'sprint');
    assert.equal(matched[4].type, 'caution');
  });
});
