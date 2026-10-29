/**
 * Terrain analysis for fueling: local gradient, steep climb / descent hazards and safe feed windows.
 *
 * @module fueling/terrain
 */

import { DEFAULT_FUELING_CONFIG } from './presets.js';
import { getInterpolatedEle } from '../signal.js';

/**
 * Evaluates the smoothed road gradient percentage at a target distance.
 *
 * @param {Array<{dist: number, smoothEle: number}>} points - Route profile points
 * @param {number} distM - Distance along track in meters
 * @param {number} [windowM=100] - Sample half-window in meters
 * @returns {number} Gradient percentage (%)
 */
export function evaluateGradientAt(points, distM, windowM = 100) {
  if (!points || points.length < 2) return 0;
  const maxD = points[points.length - 1].dist;
  if (maxD <= 0) return 0;

  const d1 = Math.max(0, distM - windowM);
  const d2 = Math.min(maxD, distM + windowM);
  const span = d2 - d1;
  if (span <= 10) return 0;

  const e1 = getInterpolatedEle(points, d1);
  const e2 = getInterpolatedEle(points, d2);
  const grade = ((e2 - e1) / span) * 100;
  return isFinite(grade) ? parseFloat(grade.toFixed(1)) : 0;
}

/**
 * Evaluates whether a target distance along the track poses a feeding hazard
 * due to severe incline or high-speed descent.
 *
 * @param {Array<{dist: number, smoothEle: number}>} points - Route points
 * @param {number} distM - Distance along track in meters
 * @param {Array<Object>} [climbs=[]] - Detected route climbs
 * @param {Object} [config=DEFAULT_FUELING_CONFIG] - Threshold configuration
 * @returns {{ isHazard: boolean, type: 'climb'|'descent'|'none', grade: number, isLongClimb: boolean, climbInfo: Object|null, message: string }}
 */
export function detectTerrainHazard(points, distM, climbs = [], config = DEFAULT_FUELING_CONFIG) {
  const grade = evaluateGradientAt(points, distM, 100);
  const climbThresh = config.hazardClimbThreshold || 8.5;
  const descentThresh = config.hazardDescentThreshold || -5.0;

  // Check if inside a categorized climb
  let climbInfo = null;
  let isLongClimb = false;
  if (climbs && climbs.length > 0) {
    for (const c of climbs) {
      const cStartM = (c.startKm || 0) * 1000;
      const cSummitM = (c.summitKm || 0) * 1000;
      if (distM >= cStartM && distM <= cSummitM) {
        climbInfo = c;
        const climbLengthM = (c.lengthKm || 0) * 1000;
        if (climbLengthM >= (config.longClimbDistThresholdM || 5000)) {
          isLongClimb = true;
        }
        break;
      }
    }
  }

  if (grade >= climbThresh) {
    return {
      isHazard: true,
      type: 'climb',
      grade,
      isLongClimb,
      climbInfo,
      message: isLongClimb
        ? `Long climb (${grade}%). Necessary mid-climb feed: stick to quick liquid/gel.`
        : `Steep incline (${grade}%). High cardiac load & choking hazard. Pre-fuel in valley before climb.`
    };
  }

  if (grade <= descentThresh) {
    return {
      isHazard: true,
      type: 'descent',
      grade,
      isLongClimb: false,
      climbInfo: null,
      message: `Fast descent (${grade}%). High speed & braking zone. Hands must remain on handlebars.`
    };
  }

  return {
    isHazard: false,
    type: 'none',
    grade,
    isLongClimb,
    climbInfo,
    message: `Safe feed zone (${grade >= 0 ? '+' : ''}${grade}% grade).`
  };
}

/**
 * Searches for the nearest safe feeding corridor (-2% to +5% gradient)
 * around a given distance point.
 *
 * @param {Array<{dist: number, smoothEle: number}>} points - Route points
 * @param {number} targetDistM - Target distance in meters
 * @param {number} [maxSearchM=3000] - Maximum search radius in meters
 * @param {'backward'|'forward'|'nearest'} [direction='backward'] - Search direction
 * @returns {number} Adjusted distance in meters
 */
export function findNearestSafeWindow(points, targetDistM, maxSearchM = 3000, direction = 'backward') {
  if (!points || points.length < 2) return targetDistM;
  const maxD = points[points.length - 1].dist;
  const step = 100; // Search in 100m steps

  const testDist = d => {
    const g = evaluateGradientAt(points, d, 80);
    return g >= -2.5 && g <= 5.5;
  };

  // If already safe, keep as is
  if (testDist(targetDistM)) return targetDistM;

  const maxSteps = Math.floor(maxSearchM / step);

  if (direction === 'backward' || direction === 'nearest') {
    for (let i = 1; i <= maxSteps; i++) {
      const d = targetDistM - (i * step);
      if (d < 0) break;
      if (testDist(d)) return d;
    }
  }

  if (direction === 'forward' || direction === 'nearest') {
    for (let i = 1; i <= maxSteps; i++) {
      const d = targetDistM + (i * step);
      if (d > maxD) break;
      if (testDist(d)) return d;
    }
  }

  return targetDistM; // Fallback if no safe point found within window
}
