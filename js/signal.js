/**
 * Signal Processing Module
 *
 * Implements core geospatial and digital signal processing algorithms:
 * 1. Cumulative Haversine Distance ($R = 6,371,000\text{ m}$)
 * 2. Distance-window Elevation Smoothing, gradients and hysteresis climbing totals
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
import { smoothByDistance, smoothingWindowM, gradesByDistance, climbingTotals, maxSustainedAscent, GRADE_HALF_WINDOW_M, SUSTAINED_SPAN_M, SUSTAINED_MIN_SPAN_M } from './signal/smooth.js';
import { normalizeCoordinates } from './units.js';

export * from './signal/geo.js';
export * from './signal/blocks.js';
export * from './signal/climbs.js';
export * from './signal/despike.js';
export * from './signal/waypoint-match.js';
export * from './signal/smooth.js';

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
 * @param {number} [smoothingWindow=7] - Smoothing setting; the window is smoothingWindowM(setting) metres of route
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

  // 2. Distance-window moving average (eliminates barometric/GPS jitter whatever the point spacing)
  const smoothedEles = smoothByDistance(cumDistances, cleanedEles, smoothingWindowM(smoothingWindow));

  // 3. Point gradients over a fixed ~100 m baseline (shorter on very short tracks)
  const gradeHalfM = Math.min(GRADE_HALF_WINDOW_M, Math.max(2.5, runningDist / 8));
  const grades = gradesByDistance(cumDistances, smoothedEles, gradeHalfM);

  // 4. Points assembly & gradient zones
  const points = [];
  let minEle = smoothedEles[0];
  let maxEle = smoothedEles[0];

  for (let i = 0; i < N; i++) {
    const smoothEle = smoothedEles[i];
    if (smoothEle < minEle) minEle = smoothEle;
    if (smoothEle > maxEle) maxEle = smoothEle;

    const grade = grades[i];
    const absG = Math.abs(grade);
    // 4-tier pro cycling gradient classification
    let zone = 0;
    if (absG < 5) zone = 0;       // Zone 1: Flat / False Flat
    else if (absG < 8) zone = 1;  // Zone 2: Moderate Climb
    else if (absG < 12) zone = 2; // Zone 3: Steep Climb
    else zone = 3;                // Zone 4: Severe Gradient

    points.push({ dist: cumDistances[i], rawEle: normCoords[i].ele, smoothEle, grade: parseFloat(grade.toFixed(1)), zone });
  }

  // 5. Climbing totals with hysteresis, so sensor jitter adds no phantom metres
  const { gain: totalGain, loss: totalLoss } = climbingTotals(smoothedEles);

  // Sustained max gradient over ~50 m (roadbooks quote max pitch over 50-100 m);
  // short tracks (< 100 m) use proportionally shorter spans
  const targetSpan = Math.min(SUSTAINED_SPAN_M, Math.max(15, runningDist * 0.25));
  const minSpan = Math.min(SUSTAINED_MIN_SPAN_M, Math.max(10, runningDist * 0.15));
  let maxSustainedGrade = maxSustainedAscent(cumDistances, smoothedEles, targetSpan, minSpan);

  // Fallback for tracks too short for any span
  if (maxSustainedGrade === 0 && totalGain > 0 && runningDist > 0) {
    maxSustainedGrade = (totalGain / runningDist) * 100;
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
