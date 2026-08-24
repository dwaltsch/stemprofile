/**
 * Units and Coordinate Normalization Test Suite
 *
 * Tests unit conversions, telemetry label formatting, and multi-format coordinate normalization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getUnitLabels,
  getUnitFactors,
  formatDistance,
  formatElevation,
  formatGrade,
  normalizeCoordinates
} from '../js/units.js';

describe('Units Module: Formatting & Labels', () => {
  it('provides metric labels and conversion factors', () => {
    const labels = getUnitLabels('metric');
    assert.equal(labels.dist, 'km');
    assert.equal(labels.ele, 'm');
    assert.equal(labels.distShort, 'k');

    const factors = getUnitFactors('metric');
    assert.equal(factors.dFactor, 0.001);
    assert.equal(factors.eFactor, 1.0);
  });

  it('provides imperial labels and conversion factors', () => {
    const labels = getUnitLabels('imperial');
    assert.equal(labels.dist, 'mi');
    assert.equal(labels.ele, 'ft');

    const factors = getUnitFactors('imperial');
    assert.ok(Math.abs(factors.dFactor - (1 / 1609.344)) < 1e-6);
    assert.ok(Math.abs(factors.eFactor - 3.28084) < 1e-3);
  });

  it('formats distances correctly across unit systems', () => {
    assert.equal(formatDistance(45200, 'metric', 1), '45.2 km');
    assert.equal(formatDistance(16093.44, 'imperial', 1), '10.0 mi');
  });

  it('formats elevations with optional sign prefix', () => {
    assert.equal(formatElevation(1250, 'metric', false), '1250 m');
    assert.equal(formatElevation(1250, 'metric', true), '+1250 m');
    assert.equal(formatElevation(1000, 'imperial', true), '+3281 ft');
  });

  it('formats gradients with custom prefix and precision', () => {
    assert.equal(formatGrade(8.46, 1), '8.5%');
    assert.equal(formatGrade(14.2, 1, 'Max '), 'Max 14.2%');
  });
});

describe('Units Module: Coordinate Normalization', () => {
  it('normalizes array tuples [lat, lon, ele]', () => {
    const tuples = [
      [45.0, 6.0, 500],
      [45.1, 6.1, 600]
    ];
    const norm = normalizeCoordinates(tuples);
    assert.equal(norm.length, 2);
    assert.equal(norm[0].lat, 45.0);
    assert.equal(norm[0].lon, 6.0);
    assert.equal(norm[0].ele, 500);
  });

  it('normalizes object coordinates {lat, lon, ele}', () => {
    const objs = [
      { lat: 45.0, lon: 6.0, ele: 500 },
      { lat: 45.1, lon: 6.1, ele: 600 }
    ];
    const norm = normalizeCoordinates(objs);
    assert.equal(norm.length, 2);
    assert.equal(norm[1].ele, 600);
  });

  it('normalizes synthetic distance points {dist, ele}', () => {
    const distPts = [
      { dist: 0, ele: 300 },
      { dist: 10000, smoothEle: 800 }
    ];
    const norm = normalizeCoordinates(distPts);
    assert.equal(norm.length, 2);
    assert.equal(norm[0].dist, 0);
    assert.equal(norm[0].ele, 300);
    assert.equal(norm[1].dist, 10000);
    assert.equal(norm[1].ele, 800);
  });

  it('handles empty or non-array inputs safely', () => {
    assert.deepEqual(normalizeCoordinates(null), []);
    assert.deepEqual(normalizeCoordinates([]), []);
  });
});
