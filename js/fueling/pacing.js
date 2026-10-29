/**
 * Gradient-aware pacing model.
 *
 * Estimates where along the route the rider will be at any elapsed time by
 * solving a steady-state cycling power equation per gradient:
 *
 *   P = v · m·g·(sin θ + Crr·cos θ) + ½·ρ·CdA·v³
 *
 * Power is calibrated so the overall moving average matches the user's
 * average speed setting: time is redistributed from descents to climbs, but
 * the total moving time stays what the rider expects. Descents are capped at
 * a realistic braking speed and very steep ramps at a walking-pace floor.
 *
 * @module fueling/pacing
 */

const G = 9.81;
const GRADE_BIN_PCT = 0.5;
const MAX_ABS_GRADE_PCT = 30;

/** Rider + bike physics defaults (typical road setup, hoods position). */
export const DEFAULT_PACING_PHYSICS = {
  massKg: 82,          // rider + bike + kit
  cdA: 0.32,           // aerodynamic drag area (m²)
  crr: 0.005,          // rolling resistance coefficient
  rho: 1.2,            // air density (kg/m³)
  maxDescentKmh: 60,   // braking / cornering cap on descents
  minSpeedKmh: 6       // floor on very steep ramps
};

/**
 * @typedef {Object} Pacing
 * @property {'terrain'|'constant'} mode - Active pacing model
 * @property {number} totalSec - Total moving time over the route
 * @property {number} powerW - Calibrated steady power (terrain mode; 0 in constant mode)
 * @property {function(number): number} timeAt - Elapsed seconds at a route distance (m)
 * @property {function(number): number} distAt - Route distance (m) reached at elapsed seconds
 * @property {function(number): number} speedKmhAtGrade - Modelled speed on a gradient (%)
 */

/**
 * Solves the power equation for ground speed on a given gradient.
 *
 * @param {number} watts - Rider power output
 * @param {number} gradePct - Road gradient in percent
 * @param {Object} [phys=DEFAULT_PACING_PHYSICS] - Physics parameters
 * @returns {number} Speed in m/s, clamped to the configured floor and descent cap
 */
export function speedForPower(watts, gradePct, phys = DEFAULT_PACING_PHYSICS) {
  const theta = Math.atan(gradePct / 100);
  const resist = phys.massKg * G * (Math.sin(theta) + phys.crr * Math.cos(theta));
  const aero = 0.5 * phys.rho * phys.cdA;
  // f(v) = aero·v³ + resist·v − P has exactly one positive root (f(0) = −P < 0); bisect for it.
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (aero * mid * mid * mid + resist * mid - watts > 0) hi = mid;
    else lo = mid;
  }
  const v = (lo + hi) / 2;
  return Math.min(phys.maxDescentKmh / 3.6, Math.max(phys.minSpeedKmh / 3.6, v));
}

function gradeBin(gradePct) {
  const g = Math.max(-MAX_ABS_GRADE_PCT, Math.min(MAX_ABS_GRADE_PCT, gradePct || 0));
  return Math.round(g / GRADE_BIN_PCT);
}

function binGrade(bin) {
  return bin * GRADE_BIN_PCT;
}

/** Binary search: index of the last element in sorted `arr` that is <= value. */
function floorIndex(arr, value) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function interpolate(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) {
    // Extrapolate past the end with the final segment's rate
    const dx = xs[n - 1] - xs[n - 2];
    const rate = dx > 0 ? (ys[n - 1] - ys[n - 2]) / dx : 0;
    return ys[n - 1] + (x - xs[n - 1]) * rate;
  }
  const i = floorIndex(xs, x);
  const span = xs[i + 1] - xs[i];
  const r = span > 0 ? (x - xs[i]) / span : 0;
  return ys[i] + r * (ys[i + 1] - ys[i]);
}

function constantPacing(totalDistM, avgSpeedKmh) {
  const ms = Math.max(5, avgSpeedKmh || 25) / 3.6;
  return {
    mode: 'constant',
    totalSec: totalDistM / ms,
    powerW: 0,
    timeAt: d => Math.max(0, d) / ms,
    distAt: t => Math.max(0, t) * ms,
    speedKmhAtGrade: () => ms * 3.6
  };
}

const cache = new WeakMap();

/**
 * Builds the pacing model for a route. Results are memoized per points array.
 *
 * @param {Array<{dist: number, grade: number}>} points - Profile points with smoothed gradient
 * @param {Object} [config] - Fueling config
 * @param {number} [config.avgSpeedKmh=25] - Target overall moving average speed
 * @param {'terrain'|'constant'} [config.pacingMode='terrain'] - Pacing model
 * @param {Object} [phys=DEFAULT_PACING_PHYSICS] - Physics overrides
 * @returns {Pacing}
 */
export function buildPacing(points, config = {}, phys = DEFAULT_PACING_PHYSICS) {
  const avgSpeedKmh = Math.max(5, config.avgSpeedKmh || 25);
  const mode = config.pacingMode === 'constant' ? 'constant' : 'terrain';
  if (!Array.isArray(points) || points.length < 2) return constantPacing(0, avgSpeedKmh);

  const totalDistM = points[points.length - 1].dist - points[0].dist;
  if (mode === 'constant' || totalDistM <= 0) return constantPacing(totalDistM, avgSpeedKmh);

  const key = `${avgSpeedKmh}|${JSON.stringify(phys)}`;
  const hit = cache.get(points);
  if (hit && hit.key === key) return hit.pacing;

  // Histogram of route length per gradient bin, so calibration cost is independent of point count
  const segBins = new Int16Array(points.length);
  const lengthByBin = new Map();
  for (let i = 1; i < points.length; i++) {
    const len = points[i].dist - points[i - 1].dist;
    const bin = gradeBin(points[i].grade);
    segBins[i] = bin;
    if (len > 0) lengthByBin.set(bin, (lengthByBin.get(bin) || 0) + len);
  }

  const totalTimeAt = watts => {
    let t = 0;
    for (const [bin, len] of lengthByBin) t += len / speedForPower(watts, binGrade(bin), phys);
    return t;
  };

  // Moving time decreases monotonically with power; bisect for the target average.
  const targetSec = totalDistM / (avgSpeedKmh / 3.6);
  let lo = 1;
  let hi = 3000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (totalTimeAt(mid) > targetSec) lo = mid;
    else hi = mid;
  }
  const powerW = (lo + hi) / 2;

  const speedByBin = new Map();
  const speedOfBin = bin => {
    if (!speedByBin.has(bin)) speedByBin.set(bin, speedForPower(powerW, binGrade(bin), phys));
    return speedByBin.get(bin);
  };

  const dists = new Float64Array(points.length);
  const times = new Float64Array(points.length);
  const d0 = points[0].dist;
  for (let i = 1; i < points.length; i++) {
    dists[i] = points[i].dist - d0;
    const len = dists[i] - dists[i - 1];
    times[i] = times[i - 1] + (len > 0 ? len / speedOfBin(segBins[i]) : 0);
  }

  const pacing = {
    mode,
    totalSec: times[times.length - 1],
    powerW,
    timeAt: d => Math.max(0, interpolate(dists, times, d - d0)),
    distAt: t => d0 + Math.max(0, interpolate(times, dists, t)),
    speedKmhAtGrade: g => speedOfBin(gradeBin(g)) * 3.6
  };
  cache.set(points, { key, pacing });
  return pacing;
}

/**
 * Convenience accessor for the pacing model of an app state.
 *
 * @param {Object} state - Store state ({ points, fueling })
 * @returns {Pacing}
 */
export function getStatePacing(state) {
  return buildPacing(state && state.points, (state && state.fueling) || {});
}
