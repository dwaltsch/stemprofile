/**
 * Signal Processing Module
 *
 * Implements core geospatial and digital signal processing algorithms:
 * 1. Cumulative Haversine Distance ($R = 6,371,000\text{ m}$)
 * 2. Moving Average Elevation Smoothing (eliminates GPS quantization jitter)
 * 3. Spatial Discretization (uniform roadbook kilometer/block columns)
 * 4. UCI Pro Climb Categorization & Peak Detection (HC, Cat 1, 2, 3, 4)
 * 5. Waypoint Proximity Matching & Semantic Classification
 *
 * @module signal
 */

import { buildSpatialBlocks } from './signal/blocks.js';
import { calcHaversine } from './signal/geo.js';
import { despikeElevations } from './signal/despike.js';
import { detectClimbs } from './signal/climbs.js';
import { normalizeCoordinates } from './units.js';

export * from './signal/geo.js';
export * from './signal/blocks.js';
export * from './signal/climbs.js';
export * from './signal/despike.js';
export * from './signal/waypoint-match.js';

/**
 * @typedef {Object} ProfilePoint
 * @property {number} dist - Cumulative distance from start in meters
 * @property {number} rawEle - Original unsmoothed elevation in meters
 * @property {number} smoothEle - Moving-average filtered elevation in meters
 * @property {number} grade - Instantaneous gradient percentage (%)
 * @property {number} zone - Gradient zone index (0: <5%, 1: 5-8%, 2: 8-12%, 3: >12%)
 */

/**
 * @typedef {Object} RouteStats
 * @property {number} totalDist - Total route distance in meters
 * @property {number} elevGain - Total cumulative vertical ascent in meters
 * @property {number} elevLoss - Total cumulative vertical descent in meters
 * @property {number} minEle - Minimum route elevation in meters
 * @property {number} maxEle - Maximum route elevation in meters
 * @property {number} maxGrade - Maximum gradient percentage encountered (%)
 * @property {number} climbsCount - Number of categorized climbs detected
 * @property {number} blocksCount - Number of discretized spatial blocks generated
 */

/**
 * @typedef {Object} SpatialBlock
 * @property {number} index - 1-based sequential block index
 * @property {number} startDist - Start distance along track in meters
 * @property {number} endDist - End distance along track in meters
 * @property {number} lengthM - Physical block length in meters
 * @property {number} startEle - Interpolated start elevation in meters
 * @property {number} endEle - Interpolated end elevation in meters
 * @property {number} grade - Average block gradient percentage (%)
 * @property {number} absGrade - Absolute average block gradient percentage (%)
 * @property {number} zone - Gradient color zone index (0 to 3)
 */

/**
 * @typedef {Object} GpxCoordinate
 * @property {number} lat - Latitude in decimal degrees
 * @property {number} lon - Longitude in decimal degrees
 * @property {number} ele - Elevation in meters
 * @property {number} [dist] - Optional pre-computed distance in meters
 */

/**
 * @typedef {Object} GpxRawWaypoint
 * @property {number} lat - Latitude in decimal degrees
 * @property {number} lon - Longitude in decimal degrees
 * @property {string} [name] - Waypoint label or name
 * @property {string} [sym] - Waypoint symbol descriptor
 * @property {string} [desc] - Waypoint note or description
 * @property {string} [typeStr] - Waypoint type category
 */

/**
 * @typedef {Object} DetectedClimb
 * @property {number} id - Unique climb identifier
 * @property {'HC'|'Cat 1'|'Cat 2'|'Cat 3'|'Cat 4'} category - Official UCI climb category
 * @property {number} startKm - Distance of climb start in kilometers
 * @property {number} summitKm - Distance of climb summit/crest in kilometers
 * @property {number} lengthKm - Total climb length in kilometers
 * @property {number} gainM - Total vertical ascent of climb in meters
 * @property {number} summitEle - Summit altitude in meters
 * @property {number} avgGrade - Average gradient percentage of the climb (%)
 * @property {number} maxGrade - Maximum localized pitch encountered on the climb (%)
 */

/**
 * Main signal processing pipeline:
 * Ingests GPS raw coordinates, executes smoothing, calculates telemetry stats,
 * detects climbs, and discretizes spatial blocks.
 *
 * @param {GpxCoordinate[]} coords - Raw GPS track coordinates
 * @param {number} [smoothingWindow=7] - Moving average window size in points (must be odd)
 * @param {number} [blockSizeM=1000] - Roadbook block segment size in meters (0 for continuous)
 * @returns {{ points: ProfilePoint[], stats: RouteStats|null, climbs: DetectedClimb[], blocks: SpatialBlock[] }}
 */
export function processTrackSignal(coords, smoothingWindow = 7, blockSizeM = 1000) {
  if (!coords || coords.length < 2) {
    return { points: [], stats: null, climbs: [], blocks: [] };
  }

  // Normalize coords whether provided as [{lat, lon, ele}], [[lat, lon, ele]], or [{dist, ele}]
  const normCoords = normalizeCoordinates(coords);

  const N = normCoords.length;

  // 1. Cumulative Haversine Distance
  const cumDistances = [0];
  let runningDist = 0;
  for (let i = 1; i < N; i++) {
    if (normCoords[i].dist !== undefined) {
      runningDist = normCoords[i].dist;
    } else {
      const d = calcHaversine(normCoords[i - 1].lat, normCoords[i - 1].lon, normCoords[i].lat, normCoords[i].lon);
      runningDist += d;
    }
    cumDistances.push(runningDist);
  }

  // 1b. Adaptive Elevation Despiking (Rejects isolated impulse glitches)
  const cleanedEles = despikeElevations(normCoords, cumDistances);

  // 2. Moving Average Elevation Smoothing (eliminates barometric/GPS jitter)
  const W = Math.max(1, smoothingWindow);
  const halfW = Math.floor(W / 2);
  const smoothedEles = new Array(N);

  for (let i = 0; i < N; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - halfW);
    const end = Math.min(N - 1, i + halfW);
    for (let j = start; j <= end; j++) {
      sum += cleanedEles[j];
      count++;
    }
    smoothedEles[i] = sum / count;
  }

  // 3. Robust Baseline Slope Calculation
  const rawGrades = new Array(N).fill(0);
  for (let i = 1; i < N; i++) {
    // Compute slope over a stable ~20-30m baseline window
    let bIdx = i - 1;
    while (bIdx > 0 && (cumDistances[i] - cumDistances[bIdx]) < 15) {
      bIdx--;
    }
    let fIdx = i;
    while (fIdx < N - 1 && (cumDistances[fIdx] - cumDistances[i]) < 15) {
      fIdx++;
    }

    let baseD = cumDistances[fIdx] - cumDistances[bIdx];
    let baseE = smoothedEles[fIdx] - smoothedEles[bIdx];

    // If baseD is too small because points are clustered or track is short:
    // expand window further to find a stable baseline of at least 15-20m if track permits
    if (baseD < 15 && runningDist >= 15) {
      while (bIdx > 0 && baseD < 20) {
        bIdx--;
        baseD = cumDistances[fIdx] - cumDistances[bIdx];
      }
      while (fIdx < N - 1 && baseD < 20) {
        fIdx++;
        baseD = cumDistances[fIdx] - cumDistances[bIdx];
      }
      baseE = smoothedEles[fIdx] - smoothedEles[bIdx];
    }

    let g = 0;
    if (baseD >= 5) {
      g = (baseE / baseD) * 100;
    } else if (runningDist > 0) {
      // For ultra-short tracks under 5m, use whole track grade
      const wholeD = cumDistances[N - 1] - cumDistances[0];
      const wholeE = smoothedEles[N - 1] - smoothedEles[0];
      g = wholeD > 2 ? (wholeE / wholeD) * 100 : 0;
    }

    if (!isFinite(g) || isNaN(g)) g = 0;

    // Clamp instantaneous slope to physical bounds
    if (g > 35) g = 35;
    if (g < -35) g = -35;
    rawGrades[i] = g;
  }

  // 4. Rolling 5-Sample Gradient Moving Average Filter (eliminates false GPS spikes)
  const filteredGrades = new Array(N);
  const gHalf = 2; // 5-sample window
  for (let i = 0; i < N; i++) {
    let sumG = 0;
    let countG = 0;
    const s = Math.max(0, i - gHalf);
    const e = Math.min(N - 1, i + gHalf);
    for (let j = s; j <= e; j++) {
      sumG += rawGrades[j];
      countG++;
    }
    const avgG = countG > 0 ? (sumG / countG) : 0;
    filteredGrades[i] = isFinite(avgG) ? avgG : 0;
  }

  // 5. Points Assembly & Sustained Max Gradient Calculation
  const points = [];
  let totalGain = 0;
  let totalLoss = 0;
  let minEle = smoothedEles[0];
  let maxEle = smoothedEles[0];

  for (let i = 0; i < N; i++) {
    const dist = cumDistances[i];
    const rawEle = normCoords[i].ele;
    const smoothEle = smoothedEles[i];
    const grade = filteredGrades[i];

    if (smoothEle < minEle) minEle = smoothEle;
    if (smoothEle > maxEle) maxEle = smoothEle;

    if (i > 0) {
      const deltaE = smoothEle - smoothedEles[i - 1];
      if (deltaE > 0) totalGain += deltaE;
      else totalLoss += Math.abs(deltaE);
    }

    const safeGrade = isFinite(grade) ? grade : 0;
    const absG = Math.abs(safeGrade);

    // 4-tier pro cycling gradient classification
    let zone = 0;
    if (absG < 5) zone = 0;       // Zone 1: Flat / False Flat
    else if (absG < 8) zone = 1;  // Zone 2: Moderate Climb
    else if (absG < 12) zone = 2; // Zone 3: Steep Climb
    else zone = 3;                // Zone 4: Severe Gradient

    points.push({ dist, rawEle, smoothEle, grade: parseFloat(safeGrade.toFixed(1)), zone });
  }

  // Sustained Max Gradient: Evaluated over sustained distance to avoid micro-spikes.
  // Grand Tour and pro roadbooks evaluate max climb pitch over 50-100m.
  // For short tracks (< 100m), adapt the minimum span proportionally to track length.
  const targetSpan = Math.min(50, Math.max(15, runningDist * 0.25));
  const minSpan = Math.min(30, Math.max(10, runningDist * 0.15));

  let maxSustainedGrade = 0;
  for (let i = 0; i < N; i++) {
    let j = i;
    while (j < N - 1 && (cumDistances[j] - cumDistances[i]) < targetSpan) {
      j++;
    }
    const spanD = cumDistances[j] - cumDistances[i];
    if (spanD >= minSpan) {
      // Max gradient is the steepest ASCENT slope (positive climbing pitch)
      const deltaE = smoothedEles[j] - smoothedEles[i];
      if (deltaE > 0) {
        const spanG = (deltaE / spanD) * 100;
        if (isFinite(spanG) && spanG > maxSustainedGrade) {
          maxSustainedGrade = spanG;
        }
      }
    }
  }

  // Fallback for short tracks where spanD might be smaller than minSpan (e.g. runningDist < 10m)
  if (maxSustainedGrade === 0 && totalGain > 0 && runningDist > 0) {
    const avgRouteGrade = (totalGain / runningDist) * 100;
    maxSustainedGrade = isFinite(avgRouteGrade) ? avgRouteGrade : 0;
  }

  const maxGrade = Math.min(35.0, isFinite(maxSustainedGrade) ? parseFloat(maxSustainedGrade.toFixed(1)) : 0);

  // 6. Spatial Blocks & Climbs
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
