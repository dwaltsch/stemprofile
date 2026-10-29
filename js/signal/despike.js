/**
 * Outlier removal before smoothing: GPS position glitches (a fix that jumps
 * kilometres away and back) and elevation spikes from GPS / barometric sensors.
 *
 * @module signal/despike
 */

import { calcHaversine } from './geo.js';

/** Longest run of glitched fixes that is removed when the track jumps away and comes back. */
const MAX_GLITCH_RUN = 10;

/**
 * Drops GPS position glitches: runs of up to MAX_GLITCH_RUN points that jump far
 * away from the track and then return. A jump counts as a glitch when it is at
 * least 5 km and 50x the track's median point spacing. A jump that never returns
 * (ferry, tunnel, joined tracks) is kept. A bad first fix is dropped too.
 * Synthetic distance-based coordinates are returned unchanged.
 *
 * @param {Array<{lat: number, lon: number, dist?: number}>} coords - Normalized coordinates
 * @returns {Array<Object>} Coordinates without position glitches
 */
export function dropPositionSpikes(coords) {
  if (!Array.isArray(coords) || coords.length < 3 || coords.some(c => c.dist !== undefined)) return coords;
  const dist = (a, b) => calcHaversine(a.lat, a.lon, b.lat, b.lon);

  const steps = [];
  for (let i = 1; i < coords.length; i++) steps.push(dist(coords[i - 1], coords[i]));
  const median = steps.slice().sort((a, b) => a - b)[Math.floor(steps.length / 2)];
  const threshold = Math.max(5000, median * 50);

  // Leading glitch: the first fixes are far from a track that is otherwise continuous
  let start = 0;
  while (start < Math.min(MAX_GLITCH_RUN, coords.length - 2) &&
    dist(coords[start], coords[start + 1]) > threshold &&
    dist(coords[start + 1], coords[start + 2]) <= threshold) {
    start++;
  }

  const out = [coords[start]];
  let i = start + 1;
  while (i < coords.length) {
    const prev = out[out.length - 1];
    if (dist(prev, coords[i]) > threshold) {
      let back = -1;
      for (let j = i + 1; j < Math.min(coords.length, i + 1 + MAX_GLITCH_RUN); j++) {
        if (dist(prev, coords[j]) <= threshold) {
          back = j;
          break;
        }
      }
      if (back !== -1) {
        i = back; // skip the excursion
        continue;
      }
    }
    out.push(coords[i]);
    i++;
  }
  return out;
}

/**
 * Removes isolated single-point and two-point impulse elevation artifacts (sensor glitches,
 * barometric step jumps, zero-drops) before moving average smoothing.
 *
 * Preserves true mountain summits and steep sustained climbs (e.g. 20-30% walls).
 *
 * @param {Array<{ele: number}>} coords - Normalized coordinates
 * @param {number[]} cumDistances - Cumulative distances in meters
 * @returns {number[]} Cleaned elevation array
 */
export function despikeElevations(coords, cumDistances) {
  const N = coords.length;
  if (N < 3) return coords.map(c => (c && c.ele !== undefined ? Number(c.ele) : 0));

  const cleanEles = coords.map(c => (c && c.ele !== undefined ? Number(c.ele) : 0));

  // Pass 1: 1-point impulse spike removal
  for (let i = 1; i < N - 1; i++) {
    const prevE = cleanEles[i - 1];
    const currE = cleanEles[i];
    const nextE = cleanEles[i + 1];

    const dTotal = cumDistances[i + 1] - cumDistances[i - 1];
    const baseline = (prevE + nextE) / 2;
    const deviation = Math.abs(currE - baseline);
    // Physical maximum road slope is ~35%
    const maxPlausible = Math.max(1.5, dTotal * 0.35);
    const neighborDiff = Math.abs(nextE - prevE);

    // If point deviates beyond physically possible gradient and neighbors agree
    if (deviation > maxPlausible && deviation > neighborDiff * 1.5) {
      cleanEles[i] = baseline;
    }
  }

  // Pass 2: 2-point impulse step removal
  for (let i = 1; i < N - 2; i++) {
    const prevE = cleanEles[i - 1];
    const curr1 = cleanEles[i];
    const curr2 = cleanEles[i + 1];
    const nextE = cleanEles[i + 2];

    const dTotal = cumDistances[i + 2] - cumDistances[i - 1];
    const baseline1 = prevE + (nextE - prevE) * (1 / 3);
    const baseline2 = prevE + (nextE - prevE) * (2 / 3);
    const maxPlausible = Math.max(2.0, dTotal * 0.35);

    const dev1 = Math.abs(curr1 - baseline1);
    const dev2 = Math.abs(curr2 - baseline2);
    const neighborDiff = Math.abs(nextE - prevE);

    if (dev1 > maxPlausible && dev2 > maxPlausible && Math.min(dev1, dev2) > neighborDiff * 1.5) {
      cleanEles[i] = baseline1;
      cleanEles[i + 1] = baseline2;
    }
  }

  return cleanEles;
}
