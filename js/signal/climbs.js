/**
 * Sustained climb detection and UCI-style categorization (HC, Cat 1-4).
 *
 * @module signal/climbs
 */

import { maxSustainedAscent, SUSTAINED_SPAN_M, SUSTAINED_MIN_SPAN_M } from './smooth.js';

/** Default smallest gain (m) a detected climb needs; the climbMinGainM setting overrides it. */
export const DEFAULT_CLIMB_MIN_GAIN_M = 35;
/** Most manual climbs a route (or share link) may carry. */
export const MAX_MANUAL_CLIMBS = 50;
/** Shortest stretch accepted as a manual climb. */
export const MIN_MANUAL_CLIMB_M = 100;
/** How far (decametres) a summit may move and still keep a climb's id: 500 m. */
export const ADOPT_TOLERANCE_DAM = 50;

/**
 * Detects sustained categorized climbs along a route.
 *
 * Implements a peak-finding and valley-dip accumulator algorithm modeled after
 * standard Grand Tour stage roadbooks and the standard cycling difficulty index:
 *   Score = (Length_km) * (AvgGrade)^2 = (Length_m / 1000) * (AvgGrade)^2
 *
 * Standard cycling difficulty threshold brackets:
 * - Cat 4: 20 <= Score < 75 (or Gain >= 40m)
 * - Cat 3: 75 <= Score < 150 (or Gain >= 120m)
 * - Cat 2: 150 <= Score < 300 (or Gain >= 250m)
 * - Cat 1: 300 <= Score < 600 (or Gain >= 500m)
 * - HC (Hors Catégorie): Score >= 600 (or Gain >= 800m)
 *
 * @param {ProfilePoint[]} points - Filtered profile points array
 * @param {number} [minGainM=DEFAULT_CLIMB_MIN_GAIN_M] - Minimum required elevation gain in meters
 * @param {number} [minLengthM=500] - Minimum climb length in meters
 * @param {number} [minGradePct=3.0] - Minimum average gradient percentage
 * @returns {DetectedClimb[]} List of detected climbs ordered along the route
 */
export function detectClimbs(points, minGainM = DEFAULT_CLIMB_MIN_GAIN_M, minLengthM = 500, minGradePct = 3.0) {
  const climbs = [];
  const N = points.length;
  if (N < 5) return climbs;

  let inClimb = false;
  let startIdx = 0;
  let climbPeakIdx = 0;
  let dipAccumulator = 0;
  let i = 1;

  while (i < N) {
    const prevE = points[i - 1].smoothEle;
    const currE = points[i].smoothEle;
    const deltaE = currE - prevE;

    if (!inClimb) {
      // Trigger on a rising point whose ~100 m gradient is climbing (no per-step size: spacing varies)
      if (deltaE > 0 && points[i].grade >= minGradePct) {
        inClimb = true;
        startIdx = i - 1;
        climbPeakIdx = i;
        dipAccumulator = 0;
      }
      i++;
    } else {
      if (currE > points[climbPeakIdx].smoothEle) {
        // New highest peak within current climb
        climbPeakIdx = i;
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
        const difficultyScore = (climbLen / 1000) * Math.pow(avgGrade, 2);

        if ((difficultyScore >= 20 || climbGain >= 40) && climbLen >= minLengthM && avgGrade >= minGradePct && climbGain >= minGainM) {
          climbs.push(buildClimb(points, startIdx, climbPeakIdx));
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
 * Category for a climb from the standard difficulty index (length_km × avg%²)
 * or its total gain, whichever ranks it higher.
 *
 * @param {number} lengthM - Climb length in metres
 * @param {number} gainM - Climb elevation gain in metres
 * @returns {'HC'|'Cat 1'|'Cat 2'|'Cat 3'|'Cat 4'}
 */
export function categorizeClimb(lengthM, gainM) {
  const avgGrade = lengthM > 0 ? (gainM / lengthM) * 100 : 0;
  const score = (lengthM / 1000) * avgGrade * avgGrade;
  if (score >= 600 || gainM >= 800) return 'HC';
  if (score >= 300 || gainM >= 500) return 'Cat 1';
  if (score >= 150 || gainM >= 250) return 'Cat 2';
  if (score >= 75 || gainM >= 120) return 'Cat 3';
  return 'Cat 4';
}

/**
 * Stable climb id: the summit position in decametres. Unlike a list index it
 * survives other climbs appearing or disappearing; see adoptClimbIds for small shifts.
 *
 * @param {number} summitM - Summit distance in metres
 * @returns {number}
 */
export function climbIdFor(summitM) {
  return Math.round(summitM / 10);
}

/** Per-route cache of distance / elevation arrays for the sustained max-grade scan. */
const profileArrays = new WeakMap();

/**
 * Builds the climb record for the stretch from startIdx (foot) to peakIdx (summit).
 *
 * @param {ProfilePoint[]} points
 * @param {number} startIdx
 * @param {number} peakIdx
 * @returns {DetectedClimb}
 */
function buildClimb(points, startIdx, peakIdx) {
  let arrays = profileArrays.get(points);
  if (!arrays) {
    arrays = { dists: points.map(p => p.dist), eles: points.map(p => p.smoothEle) };
    profileArrays.set(points, arrays);
  }
  const lengthM = points[peakIdx].dist - points[startIdx].dist;
  const gainM = points[peakIdx].smoothEle - points[startIdx].smoothEle;
  const avgGrade = lengthM > 0 ? (gainM / lengthM) * 100 : 0;
  // Same sustained ~50 m measure as the route's max gradient, so a climb never quotes a steeper pitch
  const maxG = maxSustainedAscent(arrays.dists, arrays.eles, SUSTAINED_SPAN_M, SUSTAINED_MIN_SPAN_M, startIdx, Math.max(startIdx, peakIdx - 1));
  return {
    id: climbIdFor(points[peakIdx].dist),
    category: categorizeClimb(lengthM, gainM),
    startKm: points[startIdx].dist / 1000,
    summitKm: points[peakIdx].dist / 1000,
    lengthKm: lengthM / 1000,
    gainM: Math.round(gainM),
    summitEle: Math.round(points[peakIdx].smoothEle),
    avgGrade: parseFloat(avgGrade.toFixed(1)),
    maxGrade: parseFloat(Math.min(35.0, maxG).toFixed(1))
  };
}

/** Index of the point nearest to distM (points sorted by dist). */
function nearestIndex(points, distM) {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].dist < distM) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].dist - distM) <= Math.abs(points[lo].dist - distM)) lo--;
  return lo;
}

/**
 * Measures a climb the rider marked by hand, from its foot to its summit.
 *
 * @param {ProfilePoint[]} points - Processed route points
 * @param {number} startM - Foot of the climb in metres
 * @param {number} summitM - Summit in metres
 * @returns {DetectedClimb|null} Null when the stretch does not go uphill or is shorter than 100 m
 */
export function measureClimb(points, startM, summitM) {
  if (!Array.isArray(points) || points.length < 2 || !(summitM > startM)) return null;
  const startIdx = nearestIndex(points, startM);
  const peakIdx = nearestIndex(points, summitM);
  if (peakIdx <= startIdx || points[peakIdx].dist - points[startIdx].dist < MIN_MANUAL_CLIMB_M) return null;
  if (points[peakIdx].smoothEle <= points[startIdx].smoothEle) return null;
  return { ...buildClimb(points, startIdx, peakIdx), manual: true };
}

/**
 * Combines detected climbs with the rider's own. A manual climb replaces every
 * detected climb it overlaps, which is how climbs are merged or split.
 *
 * @param {ProfilePoint[]} points - Processed route points
 * @param {DetectedClimb[]} detected - Automatically detected climbs
 * @param {Array<[number, number]>} manualRanges - [startM, summitM] pairs
 * @returns {DetectedClimb[]} All climbs, ordered by summit
 */
export function applyManualClimbs(points, detected, manualRanges) {
  const manual = (Array.isArray(manualRanges) ? manualRanges : [])
    .map(r => (Array.isArray(r) ? measureClimb(points, r[0], r[1]) : null))
    .filter(Boolean);
  if (manual.length === 0) return detected;
  const overlaps = (a, b) => a.startKm < b.summitKm && b.startKm < a.summitKm;
  const kept = detected.filter(c => !manual.some(m => overlaps(c, m)));
  return [...kept, ...manual].sort((a, b) => a.summitKm - b.summitKm);
}

/**
 * Keeps climbs recognisable across re-detection: when smoothing or detection
 * settings move a summit a little, the climb takes over the id a setting still
 * refers to (hidden badge, dragged badge position) if that id is within
 * ADOPT_TOLERANCE_DAM. Manual climbs keep their own ids.
 *
 * @param {DetectedClimb[]} climbs - Climbs with fresh ids (mutated in place)
 * @param {Iterable<number>} knownIds - Ids referenced by settings
 * @returns {DetectedClimb[]} The same array
 */
export function adoptClimbIds(climbs, knownIds) {
  const known = new Set([...knownIds].filter(id => Number.isFinite(id)));
  for (const c of climbs) known.delete(c.id); // exact matches keep their id
  if (known.size === 0) return climbs;
  // Closest pairs first, so each referenced id goes to the climb nearest to it
  const pairs = [];
  for (const c of climbs) {
    if (c.manual || [...known].includes(c.id)) continue;
    for (const id of known) {
      const d = Math.abs(id - c.id);
      if (d <= ADOPT_TOLERANCE_DAM) pairs.push({ c, id, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const taken = new Set();
  const moved = new Set();
  for (const { c, id } of pairs) {
    if (taken.has(id) || moved.has(c) || climbs.some(o => o.id === id)) continue;
    taken.add(id);
    moved.add(c);
    c.id = id;
  }
  return climbs;
}

/**
 * Validates manual climb ranges from settings, storage or a share link.
 *
 * @param {*} raw - Untrusted value
 * @returns {Array<[number, number]>} [startM, summitM] pairs, rounded to metres
 */
export function sanitizeManualClimbs(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(r => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] >= 0 && r[1] - r[0] >= MIN_MANUAL_CLIMB_M && r[1] <= 1e8)
    .slice(0, MAX_MANUAL_CLIMBS)
    .map(r => [Math.round(r[0]), Math.round(r[1])]);
}
