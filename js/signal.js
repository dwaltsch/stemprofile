/**
 * Signal Processing Module
 * - Cumulative Haversine distance
 * - 7-point Moving Average elevation filter
 * - Uniform Spatial Discretization (Configurable Block Segments: 1000m, 500m, 250m, 100m)
 * - Pro Climb Segmentation & Categorization (HC, Cat 1-4)
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

/**
 * Helper to interpolate smoothed elevation at exact distance d
 */
export function getInterpolatedEle(points, targetDist) {
  if (!points || points.length === 0) return 0;
  if (targetDist <= points[0].dist) return points[0].smoothEle;
  if (targetDist >= points[points.length - 1].dist) return points[points.length - 1].smoothEle;

  let low = 0, high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid].dist < targetDist) low = mid + 1;
    else high = mid;
  }
  const p1 = points[low - 1];
  const p2 = points[low];
  const span = p2.dist - p1.dist;
  if (span <= 0) return p1.smoothEle;
  const ratio = (targetDist - p1.dist) / span;
  return p1.smoothEle + ratio * (p2.smoothEle - p1.smoothEle);
}

/**
 * Builds discrete, uniform spatial blocks (e.g. 1000m, 500m, 250m, 100m)
 */
export function buildSpatialBlocks(points, totalDist, blockSizeM = 1000) {
  if (!points || points.length < 2 || totalDist <= 0) return [];
  if (blockSizeM <= 0) return []; // 0 = continuous mode

  const numBlocks = Math.max(1, Math.ceil(totalDist / blockSizeM));
  const blocks = [];

  for (let k = 0; k < numBlocks; k++) {
    const dStart = k * blockSizeM;
    const dEnd = Math.min(totalDist, (k + 1) * blockSizeM);
    const spanM = dEnd - dStart;
    if (spanM <= 0) break;

    const eStart = getInterpolatedEle(points, dStart);
    const eEnd = getInterpolatedEle(points, dEnd);

    const grade = ((eEnd - eStart) / spanM) * 100;
    const absGrade = Math.abs(grade);

    let zone = 0;
    if (absGrade < 5) zone = 0;
    else if (absGrade < 8) zone = 1;
    else if (absGrade < 12) zone = 2;
    else zone = 3;

    blocks.push({
      index: k + 1,
      startDist: dStart,
      endDist: dEnd,
      lengthM: spanM,
      startEle: eStart,
      endEle: eEnd,
      grade: parseFloat(grade.toFixed(1)),
      absGrade: parseFloat(absGrade.toFixed(1)),
      zone
    });
  }

  return blocks;
}

export function detectClimbs(points, minGainM = 35, minLengthM = 600, minGradePct = 3.0) {
  const climbs = [];
  const N = points.length;
  if (N < 5) return climbs;

  let inClimb = false;
  let startIdx = 0;
  let climbPeakIdx = 0;
  let runningGain = 0;
  let dipAccumulator = 0;

  for (let i = 1; i < N; i++) {
    const prevE = points[i - 1].smoothEle;
    const currE = points[i].smoothEle;
    const deltaE = currE - prevE;

    if (!inClimb) {
      if (deltaE > 0.3 && points[i].grade >= minGradePct) {
        inClimb = true;
        startIdx = i - 1;
        climbPeakIdx = i;
        runningGain = deltaE;
        dipAccumulator = 0;
      }
    } else {
      if (currE > points[climbPeakIdx].smoothEle) {
        climbPeakIdx = i;
        runningGain += (currE - points[climbPeakIdx - 1].smoothEle);
        dipAccumulator = 0;
      } else {
        dipAccumulator += (points[i - 1].smoothEle - currE);
      }

      const distFromPeak = points[i].dist - points[climbPeakIdx].dist;
      if (dipAccumulator > 25 || distFromPeak > 1200 || i === N - 1) {
        const climbLen = points[climbPeakIdx].dist - points[startIdx].dist;
        const climbGain = points[climbPeakIdx].smoothEle - points[startIdx].smoothEle;
        const avgGrade = climbLen > 0 ? (climbGain / climbLen) * 100 : 0;

        if (climbGain >= minGainM && climbLen >= minLengthM && avgGrade >= minGradePct) {
          let maxG = 0;
          for (let k = startIdx; k <= climbPeakIdx; k++) {
            if (points[k].grade > maxG) maxG = points[k].grade;
          }

          const uciScore = (climbLen / 1000) * Math.pow(avgGrade, 2);
          let category = 'Cat 4';
          if (climbGain >= 900 || uciScore > 180) category = 'HC';
          else if (climbGain >= 500 || uciScore > 100) category = 'Cat 1';
          else if (climbGain >= 280 || uciScore > 50) category = 'Cat 2';
          else if (climbGain >= 130 || uciScore > 25) category = 'Cat 3';

          climbs.push({
            id: climbs.length + 1,
            category,
            startKm: points[startIdx].dist / 1000,
            summitKm: points[climbPeakIdx].dist / 1000,
            lengthKm: climbLen / 1000,
            gainM: Math.round(climbGain),
            summitEle: Math.round(points[climbPeakIdx].smoothEle),
            avgGrade: parseFloat(avgGrade.toFixed(1)),
            maxGrade: parseFloat(maxG.toFixed(1))
          });
        }

        inClimb = false;
        i = climbPeakIdx;
      }
    }
  }

  return climbs;
}

export function processTrackSignal(coords, smoothingWindow = 7, blockSizeM = 1000) {
  const N = coords.length;
  if (N < 2) {
    return { points: [], stats: null, climbs: [], blocks: [] };
  }

  // 1. Cumulative Haversine Distance
  const cumDistances = [0];
  let runningDist = 0;
  for (let i = 1; i < N; i++) {
    const d = calcHaversine(coords[i - 1].lat, coords[i - 1].lon, coords[i].lat, coords[i].lon);
    runningDist += d;
    cumDistances.push(runningDist);
  }

  // 2. Moving Average Elevation Smoothing
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

      const bIdx = Math.max(0, i - 2);
      const fIdx = Math.min(N - 1, i + 2);
      const baseD = cumDistances[fIdx] - cumDistances[bIdx];
      const baseE = smoothedEles[fIdx] - smoothedEles[bIdx];

      if (baseD > 4) {
        grade = (baseE / baseD) * 100;
      } else if (deltaD > 0.5) {
        grade = (deltaE / deltaD) * 100;
      }

      if (grade > 35) grade = 35;
      if (grade < -35) grade = -35;

      const absG = Math.abs(grade);
      if (absG > maxGrade) maxGrade = absG;

      let zone = 0;
      if (absG < 5) zone = 0;
      else if (absG < 8) zone = 1;
      else if (absG < 12) zone = 2;
      else zone = 3;

      points.push({ dist, rawEle, smoothEle, grade, zone });
    } else {
      points.push({ dist: 0, rawEle, smoothEle, grade: 0, zone: 0 });
    }
  }

  // 4. Discretize into configurable spatial blocks (e.g. 1000m, 500m, 250m, 100m)
  const blocks = buildSpatialBlocks(points, runningDist, blockSizeM);
  const climbs = detectClimbs(points);

  const stats = {
    totalDist: runningDist,
    elevGain: totalGain,
    elevLoss: totalLoss,
    minEle,
    maxEle,
    maxGrade,
    climbsCount: climbs.length,
    blocksCount: blocks.length
  };

  return { points, stats, climbs, blocks };
}
