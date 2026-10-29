/**
 * Coordinate downsampling and peak-preserving profile curve simplification for compact payloads.
 *
 * @module share/simplify
 */

/**
 * Smartly downsamples coordinates while preserving endpoints and elevation extrema.
 *
 * @param {Array<[number, number, number]|{lat:number, lon:number, ele:number}>} coords - Route coordinates
 * @param {number} [targetPoints=180] - Target points budget
 * @returns {Array<[number, number, number]>} Downsampled coordinates array
 */
export function downsampleCoords(coords, targetPoints = 180) {
  if (!coords || coords.length === 0) return [];

  const getLat = c => Array.isArray(c) ? c[0] : (c.lat || 0);
  const getLon = c => Array.isArray(c) ? c[1] : (c.lon || 0);
  const getEle = c => Array.isArray(c) ? (c[2] !== undefined ? c[2] : 0) : (c.ele !== undefined ? c.ele : 0);

  const N = coords.length;
  if (N <= targetPoints) {
    return coords.map(c => [
      Math.round(getLat(c) * 100000) / 100000,
      Math.round(getLon(c) * 100000) / 100000,
      Math.round(getEle(c) * 10) / 10
    ]);
  }

  let minIdx = 0, maxIdx = 0;
  let minEle = getEle(coords[0]), maxEle = minEle;

  for (let i = 1; i < N; i++) {
    const e = getEle(coords[i]);
    if (e < minEle) { minEle = e; minIdx = i; }
    if (e > maxEle) { maxEle = e; maxIdx = i; }
  }

  const indicesSet = new Set([0, N - 1, minIdx, maxIdx]);

  for (let i = 1; i < N - 1; i++) {
    const prevE = getEle(coords[i - 1]);
    const currE = getEle(coords[i]);
    const nextE = getEle(coords[i + 1]);
    if ((currE >= prevE && currE > nextE && Math.abs(currE - prevE) >= 3) ||
        (currE <= prevE && currE < nextE && Math.abs(currE - prevE) >= 3)) {
      indicesSet.add(i);
    }
  }

  const step = (N - 1) / (targetPoints - 1);
  for (let i = 0; i < targetPoints; i++) {
    indicesSet.add(Math.round(i * step));
  }

  let sortedIndices = Array.from(indicesSet).sort((a, b) => a - b);
  if (sortedIndices.length > targetPoints) {
    const mustKeep = new Set([0, N - 1, minIdx, maxIdx]);
    const subStep = (sortedIndices.length - 1) / (targetPoints - 1);
    const reducedSet = new Set(mustKeep);
    for (let i = 0; i < targetPoints; i++) {
      reducedSet.add(sortedIndices[Math.round(i * subStep)]);
    }
    sortedIndices = Array.from(reducedSet).sort((a, b) => a - b);
  }

  return sortedIndices.map(i => {
    const c = coords[i];
    return [
      Math.round(getLat(c) * 100000) / 100000,
      Math.round(getLon(c) * 100000) / 100000,
      Math.round(getEle(c) * 10) / 10
    ];
  });
}

/**
 * Simplifies a distance-elevation profile using Douglas-Peucker 2D polygon reduction
 * with strict summit, valley, start, and finish landmark preservation.
 *
 * @param {Array<{dist: number, ele?: number, smoothEle?: number}>} points - Track points
 * @param {number} [maxPoints=75] - Maximum point budget
 * @param {number} [epsilon=2.0] - Elevation tolerance in meters
 * @returns {Array<[number, number]>} Simplified array of [distMeters, eleMeters]
 */
export function simplifyProfileCurve(points, maxPoints = 75, epsilon = 2.0) {
  if (!points || points.length <= 2) {
    return (points || []).map(p => [
      Math.round(p.dist || 0),
      Math.round((p.ele !== undefined ? p.ele : (p.smoothEle || 0)) * 10) / 10
    ]);
  }

  const N = points.length;
  const critical = new Set([0, N - 1]);
  let minIdx = 0, maxIdx = 0;

  for (let i = 1; i < N; i++) {
    const e = points[i].ele !== undefined ? points[i].ele : (points[i].smoothEle || 0);
    const minE = points[minIdx].ele !== undefined ? points[minIdx].ele : (points[minIdx].smoothEle || 0);
    const maxE = points[maxIdx].ele !== undefined ? points[maxIdx].ele : (points[maxIdx].smoothEle || 0);
    if (e < minE) minIdx = i;
    if (e > maxE) maxIdx = i;
  }
  critical.add(minIdx);
  critical.add(maxIdx);

  // Identify prominent mountain summits (peaks with >= 15m prominence)
  const windowSize = Math.max(2, Math.floor(N / 40));
  for (let i = windowSize; i < N - windowSize; i += windowSize) {
    let localPeakIdx = i;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      const eJ = points[j].ele !== undefined ? points[j].ele : (points[j].smoothEle || 0);
      const eMax = points[localPeakIdx].ele !== undefined ? points[localPeakIdx].ele : (points[localPeakIdx].smoothEle || 0);
      if (eJ > eMax) localPeakIdx = j;
    }
    const ePeak = points[localPeakIdx].ele !== undefined ? points[localPeakIdx].ele : (points[localPeakIdx].smoothEle || 0);
    const eLeft = points[i - windowSize].ele !== undefined ? points[i - windowSize].ele : (points[i - windowSize].smoothEle || 0);
    const eRight = points[i + windowSize].ele !== undefined ? points[i + windowSize].ele : (points[i + windowSize].smoothEle || 0);
    if (ePeak - eLeft >= 15 && ePeak - eRight >= 15) {
      critical.add(localPeakIdx);
    }
  }

  const sortedLandmarks = Array.from(critical).sort((a, b) => a - b);
  const selectedSet = new Set(sortedLandmarks);

  function rdpSegment(startIdx, endIdx, eps) {
    if (endIdx - startIdx <= 1) return;
    let maxD = 0;
    let bestIdx = startIdx;

    const x1 = points[startIdx].dist;
    const y1 = points[startIdx].ele !== undefined ? points[startIdx].ele : (points[startIdx].smoothEle || 0);
    const x2 = points[endIdx].dist;
    const y2 = points[endIdx].ele !== undefined ? points[endIdx].ele : (points[endIdx].smoothEle || 0);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLen = Math.hypot(dx, dy);

    for (let i = startIdx + 1; i < endIdx; i++) {
      const px = points[i].dist;
      const py = points[i].ele !== undefined ? points[i].ele : (points[i].smoothEle || 0);
      let d = 0;
      if (lineLen === 0) {
        d = Math.abs(py - y1);
      } else {
        d = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / lineLen;
      }
      if (d > maxD) {
        maxD = d;
        bestIdx = i;
      }
    }

    if (maxD > eps) {
      selectedSet.add(bestIdx);
      rdpSegment(startIdx, bestIdx, eps);
      rdpSegment(bestIdx, endIdx, eps);
    }
  }

  for (let s = 0; s < sortedLandmarks.length - 1; s++) {
    rdpSegment(sortedLandmarks[s], sortedLandmarks[s + 1], epsilon);
  }

  let finalIndices = Array.from(selectedSet).sort((a, b) => a - b);

  if (finalIndices.length > maxPoints) {
    const step = (finalIndices.length - 1) / (maxPoints - 1);
    const pruned = new Set(sortedLandmarks);
    for (let i = 0; i < maxPoints; i++) {
      pruned.add(finalIndices[Math.round(i * step)]);
    }
    finalIndices = Array.from(pruned).sort((a, b) => a - b);
  }

  return finalIndices.map(i => {
    const d = points[i].dist !== undefined ? points[i].dist : 0;
    const e = points[i].ele !== undefined ? points[i].ele : (points[i].smoothEle || 0);
    return [Math.round(d), Math.round(e * 10) / 10];
  });
}
