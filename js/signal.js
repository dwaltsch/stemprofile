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

import { normalizeCoordinates } from './units.js';

/** Radius of the Earth in meters for spherical geodesy */
export const EARTH_RADIUS_METERS = 6371000;

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
 * Computes great-circle distance between two GPS coordinates using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of start point in degrees
 * @param {number} lon1 - Longitude of start point in degrees
 * @param {number} lat2 - Latitude of destination point in degrees
 * @param {number} lon2 - Longitude of destination point in degrees
 * @returns {number} Distance in meters
 */
export function calcHaversine(lat1, lon1, lat2, lon2) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
}

/**
 * Binary-searches and linearly interpolates smoothed elevation at an exact target distance.
 *
 * @param {ProfilePoint[]} points - Array of ordered route profile points
 * @param {number} targetDist - Distance along the track in meters
 * @returns {number} Interpolated elevation in meters
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
 * Discretizes continuous route elevation into uniform spatial block columns (e.g. 2.5km, 1.0km, 500m).
 * Mimics Grand Tour roadbook elevation profiles with exact column average gradients.
 *
 * @param {ProfilePoint[]} points - Ordered route profile points
 * @param {number} totalDist - Total distance in meters
 * @param {number} [blockSizeM=1000] - Uniform block column length in meters (0 for continuous)
 * @returns {SpatialBlock[]} Array of discretized block segments
 */
export function buildSpatialBlocks(points, totalDist, blockSizeM = 1000) {
  const numBlockSizeM = parseFloat(blockSizeM);
  if (!points || points.length < 2 || totalDist <= 0) return [];
  if (isNaN(numBlockSizeM) || numBlockSizeM <= 0) return []; // 0 = continuous mode

  const numBlocks = Math.max(1, Math.ceil(totalDist / numBlockSizeM));
  const blocks = [];

  for (let k = 0; k < numBlocks; k++) {
    const dStart = k * numBlockSizeM;
    const dEnd = Math.min(totalDist, (k + 1) * numBlockSizeM);
    const spanM = dEnd - dStart;
    if (spanM <= 0) break;

    const eStart = getInterpolatedEle(points, dStart);
    const eEnd = getInterpolatedEle(points, dEnd);

    const grade = spanM > 0 ? ((eEnd - eStart) / spanM) * 100 : 0;
    const safeGrade = isFinite(grade) ? grade : 0;
    const absGrade = Math.abs(safeGrade);

    // 4-tier pro cycling gradient classification
    let zone = 0;
    if (absGrade < 5) zone = 0;       // Zone 1: Flat / False Flat
    else if (absGrade < 8) zone = 1;  // Zone 2: Moderate Climb
    else if (absGrade < 12) zone = 2; // Zone 3: Steep Climb
    else zone = 3;                    // Zone 4: Severe Gradient

    blocks.push({
      index: k + 1,
      startDist: dStart,
      endDist: dEnd,
      lengthM: spanM,
      startEle: eStart,
      endEle: eEnd,
      grade: parseFloat(safeGrade.toFixed(1)),
      absGrade: parseFloat(absGrade.toFixed(1)),
      zone
    });
  }

  return blocks;
}

/**
 * Detects sustained categorized climbs along a route.
 *
 * Implements a peak-finding and valley-dip accumulator algorithm modeled after
 * standard Grand Tour stage roadbooks and the standard cycling difficulty index:
 *   Score = (Length_km) * (AvgGrade)^2 = (Length_m / 1000) * (AvgGrade)^2
 *
 * Calibrated threshold brackets:
 * - Cat 4: 150 <= Score < 300 (or Gain >= 80m)
 * - Cat 3: 300 <= Score < 600
 * - Cat 2: 600 <= Score < 1000
 * - Cat 1: 1000 <= Score < 1600
 * - HC (Hors Catégorie): Score >= 1600 (or Gain >= 1000m)
 *
 * @param {ProfilePoint[]} points - Filtered profile points array
 * @param {number} [minGainM=35] - Minimum required elevation gain in meters
 * @param {number} [minLengthM=500] - Minimum climb length in meters
 * @param {number} [minGradePct=3.0] - Minimum average gradient percentage
 * @returns {DetectedClimb[]} List of detected climbs ordered along the route
 */
export function detectClimbs(points, minGainM = 35, minLengthM = 500, minGradePct = 3.0) {
  const climbs = [];
  const N = points.length;
  if (N < 5) return climbs;

  let inClimb = false;
  let startIdx = 0;
  let climbPeakIdx = 0;
  let runningGain = 0;
  let dipAccumulator = 0;
  let i = 1;

  while (i < N) {
    const prevE = points[i - 1].smoothEle;
    const currE = points[i].smoothEle;
    const deltaE = currE - prevE;

    if (!inClimb) {
      // Trigger climb detection upon positive gradient onset
      if (deltaE > 0.3 && points[i].grade >= minGradePct) {
        inClimb = true;
        startIdx = i - 1;
        climbPeakIdx = i;
        runningGain = deltaE;
        dipAccumulator = 0;
      }
      i++;
    } else {
      if (currE > points[climbPeakIdx].smoothEle) {
        // New highest peak within current climb
        climbPeakIdx = i;
        runningGain += (currE - points[climbPeakIdx - 1].smoothEle);
        dipAccumulator = 0;
      } else {
        // Accumulate descent dip to identify false flats vs true downhill
        dipAccumulator += (points[i - 1].smoothEle - currE);
      }

      const distFromPeak = points[i].dist - points[climbPeakIdx].dist;
      
      // End climb if descent exceeds 25m, downhill distance > 1.2km, or reached track end
      if (dipAccumulator > 25 || distFromPeak > 1200 || i === N - 1) {
        const climbLen = points[climbPeakIdx].dist - points[startIdx].dist;
        const climbGain = points[climbPeakIdx].smoothEle - points[startIdx].smoothEle;
        const avgGrade = climbLen > 0 ? (climbGain / climbLen) * 100 : 0;

        // Standard Cycling Difficulty Index: (Distance_km) * (AvgGrade)^2
        const difficultyScore = (climbLen / 1000) * Math.pow(avgGrade, 2);

        if ((difficultyScore >= 150 || climbGain >= 80) && climbLen >= minLengthM && avgGrade >= minGradePct) {
          let maxG = 0;
          for (let k = startIdx; k <= climbPeakIdx; k++) {
            if (points[k].grade > maxG) maxG = points[k].grade;
          }

          // Calibrated category brackets
          let category = 'Cat 4';
          if (difficultyScore >= 1600 || climbGain >= 1000) {
            category = 'HC';
          } else if (difficultyScore >= 1000 || climbGain >= 600) {
            category = 'Cat 1';
          } else if (difficultyScore >= 600 || climbGain >= 350) {
            category = 'Cat 2';
          } else if (difficultyScore >= 300 || climbGain >= 180) {
            category = 'Cat 3';
          } else {
            category = 'Cat 4';
          }

          climbs.push({
            id: climbs.length + 1,
            category,
            startKm: points[startIdx].dist / 1000,
            summitKm: points[climbPeakIdx].dist / 1000,
            lengthKm: climbLen / 1000,
            gainM: Math.round(climbGain),
            summitEle: Math.round(points[climbPeakIdx].smoothEle),
            avgGrade: parseFloat(avgGrade.toFixed(1)),
            maxGrade: parseFloat(Math.min(28.0, maxG).toFixed(1))
          });
        }

        inClimb = false;
        i = Math.max(i + 1, climbPeakIdx + 1);
      } else {
        i++;
      }
    }
  }

  return climbs;
}

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
      sum += normCoords[j].ele;
      count++;
    }
    smoothedEles[i] = sum / count;
  }

  // 3. Robust Baseline Slope Calculation
  const rawGrades = new Array(N).fill(0);
  for (let i = 1; i < N; i++) {
    const deltaD = cumDistances[i] - cumDistances[i - 1];
    const deltaE = smoothedEles[i] - smoothedEles[i - 1];

    // Compute slope over a stable ~20-30m baseline window
    let bIdx = i - 1;
    while (bIdx > 0 && (cumDistances[i] - cumDistances[bIdx]) < 15) {
      bIdx--;
    }
    let fIdx = i;
    while (fIdx < N - 1 && (cumDistances[fIdx] - cumDistances[i]) < 15) {
      fIdx++;
    }

    const baseD = cumDistances[fIdx] - cumDistances[bIdx];
    const baseE = smoothedEles[fIdx] - smoothedEles[bIdx];

    let g = 0;
    if (baseD > 8) {
      g = (baseE / baseD) * 100;
    } else if (deltaD > 0.5) {
      g = (deltaE / deltaD) * 100;
    }

    if (!isFinite(g) || isNaN(g)) g = 0;

    // Clamp instantaneous slope
    if (g > 30) g = 30;
    if (g < -30) g = -30;
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

  // Sustained Max Gradient: Evaluated over >= 50m to avoid single-point spikes
  let maxSustainedGrade = 0;
  for (let i = 0; i < N; i++) {
    let j = i;
    while (j < N - 1 && (cumDistances[j] - cumDistances[i]) < 50) {
      j++;
    }
    const spanD = cumDistances[j] - cumDistances[i];
    if (spanD >= 35) {
      const spanG = Math.abs((smoothedEles[j] - smoothedEles[i]) / spanD) * 100;
      if (isFinite(spanG) && spanG > maxSustainedGrade) maxSustainedGrade = spanG;
    }
  }

  const maxGrade = Math.min(28.0, isFinite(maxSustainedGrade) ? parseFloat(maxSustainedGrade.toFixed(1)) : 0);

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

/**
 * Matches raw GPX waypoints to track distances and infers waypoint types for racing.
 *
 * Scans waypoint labels, descriptions, and symbol attributes using multilingual
 * regex keywords to automatically assign categories:
 * - 'feed' (Feed zone / Ravito)
 * - 'water' (Hydration / Fountain / Bidon)
 * - 'food' (Fuel / Gels / Bars)
 * - 'sprint' (Intermediate sprint / Green flag)
 * - 'summit' (Mountain pass / Col / Peak)
 * - 'caution' (Hazards / Cobbles / Sharp descent)
 * - 'mech' (Tech support / Bike service)
 * - 'checkpoint' (Timing check / Control point)
 *
 * @param {GpxRawWaypoint[]} rawWaypoints - Raw waypoints from GPX file
 * @param {GpxCoordinate[]} coords - Route track GPS coordinates
 * @param {ProfilePoint[]} points - Processed profile points
 * @returns {Array<{ id: string, distM: number, type: string, label: string, enabled: boolean }>}
 */
export function matchWaypointsToTrack(rawWaypoints, coords, points) {
  if (!rawWaypoints || rawWaypoints.length === 0 || !coords || coords.length < 2 || !points || points.length < 2) {
    return [];
  }

  const normCoords = normalizeCoordinates(coords);

  const results = [];
  const totalDist = points[points.length - 1].dist;

  rawWaypoints.forEach((wpt, index) => {
    let bestDistM = 0;
    let minDistToTrack = Infinity;

    for (let i = 0; i < normCoords.length; i++) {
      const d = calcHaversine(wpt.lat, wpt.lon, normCoords[i].lat, normCoords[i].lon);
      if (d < minDistToTrack) {
        minDistToTrack = d;
        bestDistM = points[i] ? points[i].dist : 0;
      }
    }

    // Only include if waypoint is near the route (< 5000m)
    if (minDistToTrack <= 5000) {
      const combinedText = `${wpt.name} ${wpt.sym} ${wpt.desc} ${wpt.typeStr}`.toLowerCase();
      let inferredType = 'feed';

      if (/(water|h2o|bottle|drink|fountain|source|bidon|eau|wasser)/i.test(combinedText)) {
        inferredType = 'water';
      } else if (/(feed|ravito|verpflegung|aid|zone|resupply|refreshment)/i.test(combinedText)) {
        inferredType = 'feed';
      } else if (/(gel|nutrition|energy|snack|bar|banana|food|bakery|cafe)/i.test(combinedText)) {
        inferredType = 'food';
      } else if (/(sprint|intermediate|hotspot|green)/i.test(combinedText)) {
        inferredType = 'sprint';
      } else if (/(summit|pass|col|peak|berg|climb|kom|qom|côte)/i.test(combinedText)) {
        inferredType = 'summit';
      } else if (/(danger|caution|hazard|gravel|pave|cobble|warning|sharp|descent)/i.test(combinedText)) {
        inferredType = 'caution';
      } else if (/(mech|repair|tech|bike|shop|service|neutral)/i.test(combinedText)) {
        inferredType = 'mech';
      } else if (/(checkpoint|cp|control|timing|timecheck|finish)/i.test(combinedText)) {
        inferredType = 'checkpoint';
      } else {
        inferredType = 'custom';
      }

      const cleanLabel = (wpt.name || wpt.sym || `WP ${index + 1}`).trim();

      results.push({
        id: `wpt-gpx-${index + 1}`,
        distM: Math.max(0, Math.min(totalDist, bestDistM)),
        type: inferredType,
        label: cleanLabel,
        enabled: true
      });
    }
  });

  results.sort((a, b) => a.distM - b.distM);
  return results;
}

