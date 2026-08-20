/**
 * Signal Processing Module
 * - Cumulative Haversine great-circle distance (meters)
 * - 7-point Moving Average elevation jitter filter
 * - Gradient percentage (Δele / Δdist)
 * - 4-tier Gradient Zone classification (<5%, 5-8%, 8-12%, >12%)
 */

export const EARTH_RADIUS_METERS = 6371000;

export function calcHaversine(lat1, lon1, lat2, lon2) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function processTrackSignal(coords, smoothingWindow = 7) {
  const N = coords.length;
  if (N < 2) {
    return { points: [], stats: null };
  }

  // 1. Cumulative Haversine Distance
  const cumDistances = [0];
  let runningDist = 0;
  for (let i = 1; i < N; i++) {
    const d = calcHaversine(coords[i - 1].lat, coords[i - 1].lon, coords[i].lat, coords[i].lon);
    runningDist += d;
    cumDistances.push(runningDist);
  }

  // 2. Moving Average Elevation Smoothing (7-point default)
  const W = Math.max(1, smoothingWindow);
  const halfW = Math.floor(W / 2);
  const smoothedEles = new Array(N);

  for (let i = 0; i < N; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - halfW);
    const end = Math.min(N - 1, i + halfW);
    for (let j = start; j <= end; j++) {
      sum += coords[j].ele;
      count++;
    }
    smoothedEles[i] = sum / count;
  }

  // 3. Slope & 4-tier Gradient Zone Classification
  const points = [];
  let totalGain = 0;
  let totalLoss = 0;
  let minEle = smoothedEles[0];
  let maxEle = smoothedEles[0];
  let maxGrade = 0;
  let sumGrade = 0;
  const zoneDists = [0, 0, 0, 0]; // Zone 1 (<5%), Zone 2 (5-8%), Zone 3 (8-12%), Zone 4 (>12%)

  for (let i = 0; i < N; i++) {
    const dist = cumDistances[i];
    const rawEle = coords[i].ele;
    const smoothEle = smoothedEles[i];

    if (smoothEle < minEle) minEle = smoothEle;
    if (smoothEle > maxEle) maxEle = smoothEle;

    let grade = 0;
    if (i > 0) {
      const deltaD = dist - cumDistances[i - 1];
      const deltaE = smoothEle - smoothedEles[i - 1];

      if (deltaE > 0) totalGain += deltaE;
      else totalLoss += Math.abs(deltaE);

      // Gradient calculated over localized neighborhood to eliminate GPS step discretization
      const bIdx = Math.max(0, i - 2);
      const fIdx = Math.min(N - 1, i + 2);
      const baseD = cumDistances[fIdx] - cumDistances[bIdx];
      const baseE = smoothedEles[fIdx] - smoothedEles[bIdx];

      if (baseD > 4) {
        grade = (baseE / baseD) * 100;
      } else if (deltaD > 0.5) {
        grade = (deltaE / deltaD) * 100;
      }

      // Bound outliers
      if (grade > 35) grade = 35;
      if (grade < -35) grade = -35;

      const absG = Math.abs(grade);
      if (absG > maxGrade) maxGrade = absG;
      sumGrade += absG;

      // 4 Gradient Zones: <5%, 5-8%, 8-12%, >12%
      let zone = 0;
      if (absG < 5) zone = 0;
      else if (absG < 8) zone = 1;
      else if (absG < 12) zone = 2;
      else zone = 3;

      zoneDists[zone] += deltaD;
      points.push({ dist, rawEle, smoothEle, grade, zone });
    } else {
      points.push({ dist: 0, rawEle, smoothEle, grade: 0, zone: 0 });
    }
  }

  const stats = {
    totalDist: runningDist,
    elevGain: totalGain,
    elevLoss: totalLoss,
    minEle,
    maxEle,
    maxGrade,
    avgGrade: N > 1 ? (sumGrade / (N - 1)) : 0,
    zoneDists
  };

  return { points, stats };
}
