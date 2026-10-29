/**
 * Automatic fuel plan generation and hourly carbohydrate intake distribution.
 *
 * @module fueling/plan
 */

import { DEFAULT_FUELING_CONFIG, DEFAULT_FUEL_PRODUCT_DEFAULTS, FUEL_PRESETS, generateFuelId } from './presets.js';
import { detectTerrainHazard, findNearestSafeWindow } from './terrain.js';
import { distToElapsedSeconds, formatElapsedSeconds } from './timing.js';

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
  const prod = { ...DEFAULT_FUEL_PRODUCT_DEFAULTS, ...(cfg.productDefaults || {}) };
  const targetCarbsPerHour = Math.max(30, Math.min(130, cfg.targetCarbsPerHour || 75));
  const avgSpeedKmh = Math.max(10, Math.min(60, cfg.avgSpeedKmh || 25));
  const totalDistM = stats.totalDist;

  const items = [];

  // 1. Ingest existing waypoints as Aid Stations / Water stops
  const mappedWaypoints = (waypoints || []).filter(w => w && w.enabled !== false && w.distM >= 0 && w.distM <= totalDistM);
  for (const wpt of mappedWaypoints) {
    const wptType = wpt.type || 'feed';
    const isFinish = wpt.distM >= totalDistM - 1000;
    const isStart = wpt.distM < 1000;
    const cleanLabel = (wpt.label || (wptType === 'water' ? 'Water' : (wptType === 'food' ? 'Bar' : 'Feed Zone'))).trim();

    if (wptType === 'feed') {
      items.push({
        id: generateFuelId(),
        distM: Math.round(wpt.distM),
        name: isFinish ? `${cleanLabel} (Finish)` : cleanLabel,
        type: 'feed_zone',
        icon: FUEL_PRESETS.feed_zone.icon,
        carbsG: isFinish || isStart ? 0 : (prod.bottleCarbs || 40),
        fluidMl: isFinish || isStart ? 0 : (prod.bottleFluidMl || 500),
        isAidStation: true,
        notes: isFinish ? 'Finish line recovery & resupply' : (isStart ? 'Start staging & bottle check' : 'Refill bottles & grab supplies')
      });
    } else if (wptType === 'water') {
      items.push({
        id: generateFuelId(),
        distM: Math.round(wpt.distM),
        name: isFinish ? `${cleanLabel} (Finish)` : cleanLabel,
        type: 'water',
        icon: FUEL_PRESETS.water.icon,
        carbsG: 0,
        fluidMl: isFinish || isStart ? 0 : (prod.bottleFluidMl || 500),
        isAidStation: true,
        notes: isFinish ? 'Finish hydration' : 'Top off hydration'
      });
    } else if (wptType === 'food') {
      items.push({
        id: generateFuelId(),
        distM: Math.round(wpt.distM),
        name: cleanLabel,
        type: 'bar',
        icon: FUEL_PRESETS.bar.icon,
        carbsG: isFinish || isStart ? 0 : (prod.barCarbs || 35),
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
    return cat === 'HC' || cat.includes('1') || cat.includes('2') || cat.includes('3') || cat.includes('4');
  });
  for (const climb of majorClimbs) {
    const cStartM = (climb.startKm || 0) * 1000;
    const cSummitM = (climb.summitKm || 0) * 1000;
    const cLengthM = cSummitM - cStartM;

    // Place pre-climb caffeine/gel 2km before climb start (in safe approach)
    if (cStartM > 4000) {
      const preClimbM = Math.max(1000, cStartM - 2000);
      const safePreClimbM = findNearestSafeWindow(points, preClimbM, 1500, 'backward');

      // Check if another item is already close (< 3.5km)
      const hasCloseItem = items.some(it => Math.abs(it.distM - safePreClimbM) < 3500);
      if (!hasCloseItem) {
        const catStr = String(climb.category || '');
        const isBigClimb = catStr.toUpperCase().includes('HC') || catStr.includes('1');
        const isMidClimb = catStr.includes('2') || catStr.includes('3');
        const type = isBigClimb ? 'caff_gel' : (isMidClimb ? 'gel_high_carb' : 'gel');
        const name = isBigClimb ? `Caff Gel (${climb.category})` : (isMidClimb ? `HC Gel (${climb.category})` : `Gel (${climb.category})`);
        const carbs = isBigClimb ? (prod.caffGelCarbs || 30) : (isMidClimb ? (prod.hcGelCarbs || 40) : (prod.gelCarbs || 25));
        items.push({
          id: generateFuelId(),
          distM: Math.round(safePreClimbM),
          name,
          type,
          icon: FUEL_PRESETS[type]?.icon || '⚡',
          carbsG: carbs,
          fluidMl: 0,
          notes: `Take 10m before ${climb.category} ascent`
        });
      }
    }

    // If it's a long sustained climb (>= 5km), place a mid-climb gel at a flatter segment
    if (cLengthM >= (cfg.longClimbDistThresholdM || 5000)) {
      const midPointM = cStartM + (cLengthM * 0.5);
      const safeMidM = findNearestSafeWindow(points, midPointM, 1200, 'nearest');
      const hasMidItem = items.some(it => Math.abs(it.distM - safeMidM) < 3000);
      if (!hasMidItem) {
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeMidM),
          name: 'Climb Gel',
          type: 'gel',
          icon: FUEL_PRESETS.gel.icon,
          carbsG: prod.gelCarbs || 25,
          fluidMl: 0,
          notes: 'Keep glucose topped during long grind'
        });
      }
    }
  }

  // 3. Dynamic Carb Cadence Feeding
  items.sort((a, b) => a.distM - b.distM);

  const distPerHourM = avgSpeedKmh * 1000;
  const targetFeedsPerHour = targetCarbsPerHour / 32;
  const nominalIntervalHours = 1 / targetFeedsPerHour;
  const nominalIntervalM = Math.max(6000, nominalIntervalHours * distPerHourM);
  const minSpacingM = Math.max(5500, nominalIntervalM * 0.70);

  let curM = nominalIntervalM;
  let cadenceStep = 0;

  while (curM < totalDistM - 3500) {
    // Check if an existing item (aid station or pre-climb gel) is nearby
    const nearbyItem = items.find(it => Math.abs(it.distM - curM) < minSpacingM);
    if (nearbyItem) {
      const nextIntervalM = Math.max(6000, (((nearbyItem.carbsG || 30) / targetCarbsPerHour) * distPerHourM));
      curM = nearbyItem.distM + nextIntervalM;
      continue;
    }

    cadenceStep++;
    let safeTargetM = curM;
    const hazard = detectTerrainHazard(points, curM, climbs, cfg);
    if (hazard.isHazard) {
      safeTargetM = findNearestSafeWindow(points, curM, 2000, 'backward');
    }

    const conflict = items.some(it => Math.abs(it.distM - safeTargetM) < (minSpacingM * 0.75));
    let itemCarbs = prod.gelCarbs || 25;

    if (!conflict) {
      const progressRatio = safeTargetM / totalDistM;

      if (progressRatio < 0.35) {
        if (cadenceStep % 2 === 1) {
          itemCarbs = prod.barCarbs || 35;
          items.push({
            id: generateFuelId(),
            distM: Math.round(safeTargetM),
            name: 'Bar',
            type: 'bar',
            icon: FUEL_PRESETS.bar.icon,
            carbsG: itemCarbs,
            fluidMl: 0,
            notes: 'Eat early while intensity is moderate'
          });
        } else {
          itemCarbs = prod.bottleCarbs || 40;
          items.push({
            id: generateFuelId(),
            distM: Math.round(safeTargetM),
            name: 'Carb Mix',
            type: 'bottle_mix',
            icon: FUEL_PRESETS.bottle_mix.icon,
            carbsG: itemCarbs,
            fluidMl: prod.bottleFluidMl || 500,
            notes: 'Steady sips every 15 mins'
          });
        }
      } else {
        const isHc = cadenceStep % 3 === 0;
        itemCarbs = isHc ? (prod.hcGelCarbs || 40) : (prod.gelCarbs || 25);
        items.push({
          id: generateFuelId(),
          distM: Math.round(safeTargetM),
          name: isHc ? 'HC Gel' : 'Gel',
          type: isHc ? 'gel_high_carb' : 'gel',
          icon: isHc ? FUEL_PRESETS.gel_high_carb.icon : FUEL_PRESETS.gel.icon,
          carbsG: itemCarbs,
          fluidMl: 0,
          notes: 'Instant carb replenishment'
        });
      }
    }

    const nextGapM = Math.max(6000, ((itemCarbs / targetCarbsPerHour) * distPerHourM));
    curM = safeTargetM + nextGapM;
  }

  // Sort chronologically by distance
  items.sort((a, b) => a.distM - b.distM);

  // Compute elapsed time (with optional aid station stop time) and terrain hazard info
  const stopMinutesPerStation = cfg.aidStationStopMin || 0;

  return items.map(item => {
    let stopSec = 0;
    if (stopMinutesPerStation > 0) {
      const priorStations = items.filter(it => it.isAidStation && it.distM < item.distM).length;
      stopSec = priorStations * (stopMinutesPerStation * 60);
    }
    const timeSec = distToElapsedSeconds(item.distM, avgSpeedKmh, stopSec);
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
