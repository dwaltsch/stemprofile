/**
 * Gradient-Aware Pacing Test Suite
 *
 * Tests the cycling power-equation speed model, calibration to the target
 * average speed, distance/time interpolation, and its use in fuel planning.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  speedForPower,
  buildPacing,
  generateDefaultFuelPlan,
  calculateHourlyIntake,
  DEFAULT_PACING_PHYSICS
} from '../js/fueling.js';
import { createStore } from '../js/store.js';

/** 100 km route: 30 km flat, 20 km at 7%, 20 km at -7%, 30 km flat (points every 100 m). */
function climbRoute() {
  const points = [];
  let ele = 200;
  for (let i = 0; i <= 1000; i++) {
    const grade = i <= 300 ? 0 : i <= 500 ? 7 : i <= 700 ? -7 : 0;
    if (i > 0) ele += grade;
    points.push({ dist: i * 100, grade, smoothEle: ele, ele, zone: grade >= 5 ? 1 : 0 });
  }
  return { points, stats: { totalDist: 100000, elevGain: 1400, maxGrade: 7, minEle: 200, maxEle: 1600 } };
}

describe('Pacing: Power Equation Speed Model', () => {
  it('slows down monotonically as the road steepens', () => {
    let prev = Infinity;
    for (const g of [-2, 0, 2, 4, 6, 8, 10, 12]) {
      const v = speedForPower(220, g);
      assert.ok(v < prev, `speed at ${g}% should be below speed at the previous gradient`);
      prev = v;
    }
  });

  it('gives realistic road speeds for a 220 W rider', () => {
    const kmh = g => speedForPower(220, g) * 3.6;
    assert.ok(kmh(0) > 30 && kmh(0) < 40, `flat ${kmh(0)}`);
    assert.ok(kmh(8) > 9 && kmh(8) < 14, `8% ${kmh(8)}`);
  });

  it('caps descents and floors very steep ramps', () => {
    assert.ok(Math.abs(speedForPower(250, -15) * 3.6 - DEFAULT_PACING_PHYSICS.maxDescentKmh) < 1e-9);
    assert.ok(Math.abs(speedForPower(50, 25) * 3.6 - DEFAULT_PACING_PHYSICS.minSpeedKmh) < 1e-9);
  });
});

describe('Pacing: Route Model', () => {
  it('calibrates total moving time to the target average speed', () => {
    const { points } = climbRoute();
    const pacing = buildPacing(points, { avgSpeedKmh: 25 });
    assert.equal(pacing.mode, 'terrain');
    assert.ok(Math.abs(pacing.totalSec - 4 * 3600) < 1, `total ${pacing.totalSec}`);
  });

  it('spends more time per km on the climb than on the flat or descent', () => {
    const { points } = climbRoute();
    const p = buildPacing(points, { avgSpeedKmh: 25 });
    const flatKm = p.timeAt(11000) - p.timeAt(10000);
    const climbKm = p.timeAt(41000) - p.timeAt(40000);
    const descentKm = p.timeAt(61000) - p.timeAt(60000);
    assert.ok(climbKm > flatKm * 2, `climb ${climbKm}s vs flat ${flatKm}s`);
    assert.ok(descentKm < flatKm, `descent ${descentKm}s vs flat ${flatKm}s`);
  });

  it('inverts cleanly between distance and time', () => {
    const { points } = climbRoute();
    const p = buildPacing(points, { avgSpeedKmh: 27 });
    for (const d of [0, 1234, 35000, 64321, 99999]) {
      assert.ok(Math.abs(p.distAt(p.timeAt(d)) - d) < 0.01, `round-trip at ${d}`);
    }
  });

  it('constant mode is plain distance / speed', () => {
    const { points } = climbRoute();
    const p = buildPacing(points, { avgSpeedKmh: 25, pacingMode: 'constant' });
    assert.equal(p.mode, 'constant');
    assert.equal(p.timeAt(50000), 7200);
    assert.equal(p.distAt(3600), 25000);
  });

  it('memoizes per points array and speed', () => {
    const { points } = climbRoute();
    assert.equal(buildPacing(points, { avgSpeedKmh: 25 }), buildPacing(points, { avgSpeedKmh: 25 }));
    assert.notEqual(buildPacing(points, { avgSpeedKmh: 25 }), buildPacing(points, { avgSpeedKmh: 30 }));
  });
});

describe('Pacing: Fuel Plan Integration', () => {
  it('spaces cadence feeds by time, so they are closer in km on the climb', () => {
    const { points, stats } = climbRoute();
    const plan = generateDefaultFuelPlan({ points, stats, config: { avgSpeedKmh: 25, targetCarbsPerHour: 75 } });
    const dists = plan.map(i => i.distM);
    const gapsIn = (from, to) => dists.slice(1)
      .map((d, i) => ({ d, gap: d - dists[i] }))
      .filter(x => x.d > from && x.d <= to)
      .map(x => x.gap);
    const climbGap = Math.min(...gapsIn(32000, 50000));
    const flatGap = Math.max(...gapsIn(0, 30000));
    assert.ok(climbGap < flatGap, `climb gap ${climbGap} m should be < flat gap ${flatGap} m`);
  });

  it('reports item times from the pacing model', () => {
    const { points, stats } = climbRoute();
    const terrain = generateDefaultFuelPlan({ points, stats, config: { avgSpeedKmh: 25 } });
    const p = buildPacing(points, { avgSpeedKmh: 25 });
    for (const it of terrain) assert.equal(it.timeSec, Math.round(p.timeAt(it.distM)));
  });

  it('buckets hourly intake by modelled time', () => {
    const { points } = climbRoute();
    const p = buildPacing(points, { avgSpeedKmh: 25 });
    // At 50 km: constant pacing says exactly 2:00 h; terrain pacing is later (climb is slow)
    const items = [{ distM: 49000, carbsG: 30 }];
    const constant = calculateHourlyIntake(items, 100000, 25);
    const terrain = calculateHourlyIntake(items, 100000, 25, p);
    assert.equal(constant.hours.findIndex(h => h.carbsG > 0), 1);
    assert.ok(terrain.hours.findIndex(h => h.carbsG > 0) >= 2);
  });

  it('store re-times items when switching pacing mode', () => {
    const store = createStore();
    const coords = [];
    for (let i = 0; i <= 400; i++) coords.push({ lat: 45 + i * 0.0009, lon: 6, ele: i < 200 ? 300 + i * 6 : 1500 - (i - 200) * 6 });
    store.setTrack({ title: 'Pacing', coords });
    store.updateFuelSettings({ pacingMode: 'constant' });
    const item = store.addFuelItem({ distM: 18000, type: 'gel' });
    const constantSec = item.timeSec;
    store.updateFuelSettings({ pacingMode: 'terrain' });
    const terrainSec = store.getState().fueling.items.find(i => i.id === item.id).timeSec;
    assert.ok(terrainSec > constantSec, `after a long climb terrain time ${terrainSec} > constant ${constantSec}`);
  });
});
