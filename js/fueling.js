/**
 * Pro Fueling & Nutrition Strategy Module
 *
 * Implements algorithms for:
 * 1. Pro cycling carbohydrate & hydration strategy planning (~60-80g CHO/h default)
 * 2. GPX waypoint extraction (aid stations, feed zones, water stops)
 * 3. Terrain gradient hazard detection (flagging steep climbs >8-10% and descents <-5%)
 * 4. Safe feed window detection & pre-climb fueling placement
 * 5. Long sustained climb mid-ascent fueling detection
 * 6. Hourly carbohydrate distribution & pacing conversion (KM vs Elapsed Time)
 *
 * @module fueling
 */

import { getInterpolatedEle } from './signal.js';
import { getUnitFactors, getUnitLabels } from './units.js';

/**
 * Standard default configuration for fueling strategies.
 */
export const DEFAULT_FUELING_CONFIG = {
  targetCarbsPerHour: 75,       // Default within the 60-80g CHO/h bracket
  avgSpeedKmh: 25,              // Default pacing average speed (km/h)
  displayMode: 'km',            // 'km' (default) or 'time'
  hazardClimbThreshold: 8.5,    // Grade % above which eating is hazardous
  hazardDescentThreshold: -5.0, // Grade % below which descending is hazardous
  longClimbDistThresholdM: 5000 // 5km+ climb requires mid-climb fueling
};

/**
 * Nutritional item catalog with standard pro cycling presets.
 */
export const FUEL_PRESETS = {
  gel: {
    id: 'gel',
    name: 'Energy Gel',
    type: 'gel',
    icon: '⚡',
    shortCode: 'GEL',
    carbsG: 25,
    fluidMl: 0,
    color: '#eab308'
  },
  gel_high_carb: {
    id: 'gel_high_carb',
    name: 'High-Carb Hydrogel',
    type: 'gel',
    icon: '⚡⚡',
    shortCode: 'HC GEL',
    carbsG: 40,
    fluidMl: 0,
    color: '#f97316'
  },
  caff_gel: {
    id: 'caff_gel',
    name: 'Caffeine Gel',
    type: 'caff_gel',
    icon: '⚡☕',
    shortCode: 'CAFF',
    carbsG: 30,
    fluidMl: 0,
    color: '#ef4444'
  },
  bottle_mix: {
    id: 'bottle_mix',
    name: 'Carb Drink 500ml',
    type: 'bottle',
    icon: '🍾',
    shortCode: 'MIX',
    carbsG: 40,
    fluidMl: 500,
    color: '#06b6d4'
  },
  bottle_super: {
    id: 'bottle_super',
    name: 'Super Carb Mix 750ml',
    type: 'bottle',
    icon: '🍾',
    shortCode: 'SUPER',
    carbsG: 80,
    fluidMl: 750,
    color: '#2563eb'
  },
  bar: {
    id: 'bar',
    name: 'Energy Bar / Chews',
    type: 'bar',
    icon: '🍫',
    shortCode: 'BAR',
    carbsG: 35,
    fluidMl: 0,
    color: '#d97706'
  },
  food: {
    id: 'food',
    name: 'Rice Cake / Food',
    type: 'food',
    icon: '🥪',
    shortCode: 'FOOD',
    carbsG: 30,
    fluidMl: 0,
    color: '#16a34a'
  },
  feed_zone: {
    id: 'feed_zone',
    name: 'Aid Station / Feed Zone',
    type: 'feed_zone',
    icon: '🍽️',
    shortCode: 'FEED',
    carbsG: 40,
    fluidMl: 500,
    color: '#8b5cf6'
  },
  water: {
    id: 'water',
    name: 'Water Refill 500ml',
    type: 'water',
    icon: '💧',
    shortCode: 'H2O',
    carbsG: 0,
    fluidMl: 500,
    color: '#38bdf8'
  },
  salt: {
    id: 'salt',
    name: 'Electrolyte / Salt Tab',
    type: 'salt',
    icon: '💊',
    shortCode: 'SALT',
    carbsG: 0,
    fluidMl: 0,
    color: '#ec4899'
  }
};

/**
 * Generates an 8-character unique alphanumeric ID.
 * @returns {string} Unique ID
 */
export function generateFuelId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fuel-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `fuel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

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

/**
 * Converts elapsed seconds into formatted time string (HH:MM or H:MM).
 *
 * @param {number} sec - Elapsed seconds
 * @returns {string} Formatted time string
 */
export function formatElapsedSeconds(sec) {
  const totalMin = Math.round(sec / 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')} h`;
  }
  return `0:${mins.toString().padStart(2, '0')} h`;
}

/**
 * Converts distance in meters to elapsed seconds given an average speed in km/h.
 *
 * @param {number} distM - Distance in meters
 * @param {number} avgSpeedKmh - Average speed in km/h
 * @returns {number} Elapsed seconds
 */
export function distToElapsedSeconds(distM, avgSpeedKmh) {
  const safeSpeed = Math.max(5, avgSpeedKmh || 25);
  const distKm = distM / 1000;
  return Math.round((distKm / safeSpeed) * 3600);
}

/**
 * Automatically generates a recommended "Pro Default" fueling strategy:
 * - Aims for target carbs/h (default 75g CHO/h, in the 60-80g bracket)
 * - Ingests GPX waypoints (`feed`, `water`, `food`) as fixed Aid Station stops
 * - Places solid foods in the first third of the race on flat terrain
 * - Times caffeine/high-carb gels 10-15 mins (1.5-3km) before major categorized climbs
 * - Avoids steep climbs (>8.5%) and descents (<-5%) except on long sustained climbs (>5km)
 *
 * @param {Object} params
 * @param {Array<Object>} params.points - Route points
 * @param {Object} params.stats - Route statistics
 * @param {Array<Object>} [params.climbs=[]] - Detected climbs
 * @param {Array<Object>} [params.waypoints=[]] - Route waypoints
 * @param {Object} [params.config=DEFAULT_FUELING_CONFIG] - Configuration overrides
 * @returns {Array<Object>} Generated list of fuel items
 */
export function generateDefaultFuelPlan({ points, stats, climbs = [], waypoints = [], config = {} }) {
  if (!points || points.length < 2 || !stats || stats.totalDist <= 0) {
    return [];
  }

  const cfg = { ...DEFAULT_FUELING_CONFIG, ...config };
  const targetCarbsPerHour = Math.max(30, Math.min(130, cfg.targetCarbsPerHour || 75));
  const avgSpeedKmh = Math.max(10, Math.min(60, cfg.avgSpeedKmh || 25));
  const totalDistM = stats.totalDist;

  const items = [];

  // 1. Ingest existing waypoints as Aid Stations / Water stops
  const mappedWaypoints = (waypoints || []).filter(w => w && w.enabled !== false && w.distM >= 0 && w.distM <= totalDistM);
  for (const wpt of mappedWaypoints) {
    const wptType = wpt.type || 'feed';
    if (wptType === 'feed') {
      items.push({
        id: generateFuelId(),
        distM: Math.round(wpt.distM),
        name: wpt.label ? `Aid Station: ${wpt.label}` : 'Feed Zone / Musette',
        type: 'feed_zone',
        icon: FUEL_PRESETS.feed_zone.icon,
        carbsG: 40,
        fluidMl: 500,
        isAidStation: true,
        notes: 'Refill bottles & grab supplies'
      });
    } else if (wptType === 'water') {
      items.push({
        id: generateFuelId(),
        distM: Math.round(wpt.distM),
        name: wpt.label ? `Water: ${wpt.label}` : 'Water Refill',
        type: 'water',
        icon: FUEL_PRESETS.water.icon,
        carbsG: 0,
        fluidMl: 500,
        isAidStation: true,
        notes: 'Top off hydration'
      });
    } else if (wptType === 'food') {
      items.push({
        id: generateFuelId(),
        distM: Math.round(wpt.distM),
        name: wpt.label ? `Food: ${wpt.label}` : 'Food Depot',
        type: 'food',
        icon: FUEL_PRESETS.food.icon,
        carbsG: 35,
        fluidMl: 0,
        isAidStation: true,
        notes: 'Solid fuel checkpoint'
      });
    }
  }

  // 2. Climb Pre-Fueling & Long Climb Mid-Feeds
  const majorClimbs = (climbs || []).filter(c => {
    if (!c || c.enabled === false) return false;
    const cat = String(c.category || '');
    return cat === 'HC' || cat.includes('1') || cat.includes('2') || cat.includes('3');
  });
  for (const climb of majorClimbs) {
    const cStartM = (climb.startKm || 0) * 1000;
    const cSummitM = (climb.summitKm || 0) * 1000;
    const cLengthM = cSummitM - cStartM;

    // Place pre-climb caffeine/gel 2km before climb start (in safe approach)
    if (cStartM > 4000) {
      const preClimbM = Math.max(1000, cStartM - 2000);
      const safePreClimbM = findNearestSafeWindow(points, preClimbM, 1500, 'backward');

      // Check if another item is already close (< 2.5km)
      const hasCloseItem = items.some(it => Math.abs(it.distM - safePreClimbM) < 2500);
      if (!hasCloseItem) {
        const isBigClimb = climb.category === 'HC' || climb.category === '1';
        items.push({
          id: generateFuelId(),
          distM: Math.round(safePreClimbM),
          name: isBigClimb ? `Caffeine Gel (${climb.category})` : `Gel before ${climb.category} Climb`,
          type: isBigClimb ? 'caff_gel' : 'gel_high_carb',
          icon: isBigClimb ? FUEL_PRESETS.caff_gel.icon : FUEL_PRESETS.gel_high_carb.icon,
          carbsG: isBigClimb ? 30 : 40,
          fluidMl: 0,
          notes: `Take 10m before ${climb.category} ascent`
        });
      }
    }

    // If it's a long sustained climb (>= 5km), place a mid-climb gel at a flatter segment
    if (cLengthM >= (cfg.longClimbDistThresholdM || 5000)) {
      const midPointM = cStartM + (cLengthM * 0.5);
      const safeMidM = findNearestSafeWindow(points, midPointM, 1200, 'nearest');
      const hasMidItem = items.some(it => Math.abs(it.distM - safeMidM) < 2500);
      if (!hasMidItem) {
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeMidM),
          name: 'Mid-Climb Sustained Gel',
          type: 'gel',
          icon: FUEL_PRESETS.gel.icon,
          carbsG: 25,
          fluidMl: 0,
          notes: 'Keep glucose topped during long grind'
        });
      }
    }
  }

  // 3. Cadence-Based Feeding (Aiming for ~20-30 min intervals, or ~8-12 km intervals)
  const distPerHourM = avgSpeedKmh * 1000;
  const feedIntervalSec = Math.round(3600 / (targetCarbsPerHour / 25)); // e.g. 3600 / 3 = 1200s (20 mins)
  const feedIntervalM = Math.max(5000, (feedIntervalSec / 3600) * distPerHourM); // ~8km

  const numIntervals = Math.floor(totalDistM / feedIntervalM);

  for (let step = 1; step <= numIntervals; step++) {
    const rawTargetM = step * feedIntervalM;
    if (rawTargetM > totalDistM - 3000) break; // Skip right at the finish line

    // Don't place if already an item within 3km
    const alreadyCovered = items.some(it => Math.abs(it.distM - rawTargetM) < 3000);
    if (alreadyCovered) continue;

    // Determine hazard & safe window
    let safeTargetM = rawTargetM;
    const hazard = detectTerrainHazard(points, rawTargetM, climbs, cfg);
    if (hazard.isHazard) {
      safeTargetM = findNearestSafeWindow(points, rawTargetM, 2000, 'backward');
    }

    // Avoid collision after snapping
    if (items.some(it => Math.abs(it.distM - safeTargetM) < 2500)) continue;

    const progressRatio = safeTargetM / totalDistM;

    // First third of race: solids (rice cake / energy bar) + carb mix
    // Middle & late race: gels & hydrogels
    if (progressRatio < 0.35) {
      if (step % 2 === 1) {
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeTargetM),
          name: 'Solid Bar / Rice Cake',
          type: 'bar',
          icon: FUEL_PRESETS.bar.icon,
          carbsG: 35,
          fluidMl: 0,
          notes: 'Eat early while intensity is moderate'
        });
      } else {
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeTargetM),
          name: 'Carb Drink Mix (Bottle 1)',
          type: 'bottle_mix',
          icon: FUEL_PRESETS.bottle_mix.icon,
          carbsG: 40,
          fluidMl: 500,
          notes: 'Steady sips every 15 mins'
        });
      }
    } else {
      // Latter stages: gels and high carb
      if (step % 3 === 0) {
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeTargetM),
          name: 'Carb Drink Mix (Bottle 2)',
          type: 'bottle_mix',
          icon: FUEL_PRESETS.bottle_mix.icon,
          carbsG: 40,
          fluidMl: 500,
          notes: 'Finish second bottle'
        });
      } else {
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeTargetM),
          name: 'Energy Gel',
          type: 'gel',
          icon: FUEL_PRESETS.gel.icon,
          carbsG: 25,
          fluidMl: 0,
          notes: 'Instant carb replenishment'
        });
      }
    }
  }

  // Sort chronologically by distance
  items.sort((a, b) => a.distM - b.distM);

  // Compute elapsed time and terrain hazard info for each item
  return items.map(item => {
    const timeSec = distToElapsedSeconds(item.distM, avgSpeedKmh);
    const hazard = detectTerrainHazard(points, item.distM, climbs, cfg);
    return {
      ...item,
      timeSec,
      timeStr: formatElapsedSeconds(timeSec),
      grade: hazard.grade,
      isHazard: hazard.isHazard,
      hazardType: hazard.type,
      hazardMessage: hazard.message
    };
  });
}

/**
 * Calculates hourly carbohydrate distribution and pacing stats.
 *
 * @param {Array<Object>} items - Fuel items
 * @param {number} totalDistM - Total track distance in meters
 * @param {number} avgSpeedKmh - Average speed in km/h
 * @returns {{ hours: Array<{hour: number, carbsG: number, fluidMl: number, itemsCount: number}>, totalCarbsG: number, avgCarbsPerHour: number, totalFluidMl: number }}
 */
export function calculateHourlyIntake(items = [], totalDistM = 0, avgSpeedKmh = 25) {
  const safeSpeed = Math.max(5, avgSpeedKmh || 25);
  const totalHours = Math.max(1, Math.ceil((totalDistM / 1000) / safeSpeed));
  const hours = [];

  for (let h = 1; h <= totalHours; h++) {
    hours.push({
      hour: h,
      carbsG: 0,
      fluidMl: 0,
      itemsCount: 0
    });
  }

  let totalCarbsG = 0;
  let totalFluidMl = 0;

  for (const it of items) {
    const sec = distToElapsedSeconds(it.distM, safeSpeed);
    const hIdx = Math.min(totalHours - 1, Math.floor(sec / 3600));
    const carbs = it.carbsG || 0;
    const fluid = it.fluidMl || 0;

    hours[hIdx].carbsG += carbs;
    hours[hIdx].fluidMl += fluid;
    hours[hIdx].itemsCount += 1;

    totalCarbsG += carbs;
    totalFluidMl += fluid;
  }

  const durationHours = (totalDistM / 1000) / safeSpeed;
  const avgCarbsPerHour = durationHours > 0 ? Math.round(totalCarbsG / durationHours) : 0;

  return {
    hours,
    totalCarbsG,
    avgCarbsPerHour,
    totalFluidMl
  };
}
