/**
 * Elevation outlier removal for GPS / barometric spikes before smoothing.
 *
 * @module signal/despike
 */

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
