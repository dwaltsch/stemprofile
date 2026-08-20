/**
 * Signal Processing Module
 * - Cumulative Haversine great-circle distance (meters)
 * - 7-point Moving Average elevation jitter filter
 * - Gradient percentage (Δele / Δdist)
 * - 4-tier Gradient Zone classification (<5%, 5-8%, 8-12%, >12%)
 * - Pro Macro Gradient Block Segmentation & Chunking
 * - Automated Pro Climb Segmentation & Categorization (HC, Cat 1-4)
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
 * Builds chunky, readable gradient blocks by aggregating adjacent points
 * into distinct, bold gradient segments with minimum run-length.
 */
export function buildGradientBlocks(points, minChunkM = 250) {
  const N = points.length;
  if (N < 2) return [];

  const blocks = [];
  let blockPts = [points[0]];
  let blockStartDist = points[0].dist;
  let currentZone = points[0].zone;

  for (let i = 1; i < N; i++) {
    const pt = points[i];
    blockPts.push(pt);
    const distSpan = pt.dist - blockStartDist;

    // Check if zone changed and chunk length satisfies minimum threshold
    if (pt.zone !== currentZone && distSpan >= minChunkM) {
      const eleDiff = pt.smoothEle - blockPts[0].smoothEle;
      const avgG = distSpan > 0 ? (eleDiff / distSpan) * 100 : 0;

      blocks.push({
        id: blocks.length + 1,
        zone: currentZone,
        startDist: blockStartDist,
        endDist: pt.dist,
        lengthM: distSpan,
        avgGrade: Math.abs(parseFloat(avgG.toFixed(1))),
        startEle: blockPts[0].smoothEle,
        endEle: pt.smoothEle,
        points: [...blockPts]
      });

      currentZone = pt.zone;
      blockStartDist = pt.dist;
      blockPts = [pt];
    }
  }

  if (blockPts.length > 0) {
    const lastPt = blockPts[blockPts.length - 1];
    const distSpan = Math.max(1, lastPt.dist - blockStartDist);
    const eleDiff = lastPt.smoothEle - blockPts[0].smoothEle;
    const avgG = distSpan > 0 ? (eleDiff / distSpan) * 100 : 0;

    blocks.push({
      id: blocks.length + 1,
      zone: currentZone,
      startDist: blockStartDist,
      endDist: lastPt.dist,
      lengthM: distSpan,
      avgGrade: Math.abs(parseFloat(avgG.toFixed(1))),
      startEle: blockPts[0].smoothEle,
      endEle: lastPt.smoothEle,
      points: [...blockPts]
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
            name: `Climb ${climbs.length + 1}`,
            category,
            startIdx,
            endIdx: climbPeakIdx,
            startKm: points[startIdx].dist / 1000,
            summitKm: points[climbPeakIdx].dist / 1000,
            lengthKm: climbLen / 1000,
            gainM: Math.round(climbGain),
            startEle: Math.round(points[startIdx].smoothEle),
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

export function processTrackSignal(coords, smoothingWindow = 7, chunkResolutionM = 250) {
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
  let sumGrade = 0;
  const zoneDists = [0, 0, 0, 0];

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
      sumGrade += absG;

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

  // 4. Macro Gradient Blocks & Climbs
  const blocks = buildGradientBlocks(points, chunkResolutionM);
  const climbs = detectClimbs(points);

  const stats = {
    totalDist: runningDist,
    elevGain: totalGain,
    elevLoss: totalLoss,
    minEle,
    maxEle,
    maxGrade,
    avgGrade: N > 1 ? (sumGrade / (N - 1)) : 0,
    zoneDists,
    climbsCount: climbs.length,
    blocksCount: blocks.length
  };

  return { points, stats, climbs, blocks };
}
