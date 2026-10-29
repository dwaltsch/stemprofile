/**
 * Stats Strip UI Module
 *
 * Updates route telemetry (distance, gain, max grade, climbs), fueling totals,
 * the header route status pill, mobile tab counters and export button states.
 *
 * @module ui/stats-strip
 */

import { getUnitFactors, getUnitLabels, formatElevation } from '../units.js';
import { getStatePacing } from '../fueling.js';

/**
 * Refreshes stats strip values and export button enabled state.
 *
 * @param {Object} state - Store state
 */
export function updateStatsStrip(state) {
  const cfg = state.settings;
  const stats = state.stats;
  const hasData = state.points.length >= 2 && stats !== null;
  const isFuelingView = state.activeView === 'fueling';

  // 3. Buttons State
  const buttons = ['btn-share-link', 'btn-copy-svg', 'btn-export-svg', 'btn-export-png', 'btn-print'];
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasData;
  });

  // 4. Stats Strip & Header Route Status Pill
  const { dFactor, eFactor } = getUnitFactors(cfg.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(cfg.units);
  const routeStatusText = document.getElementById('route-status-text');
  const climbsCount = state.climbs ? state.climbs.length : 0;
  const fuelCount = (state.fueling && state.fueling.items) ? state.fueling.items.length : 0;

  const mobileClimbsCount = document.getElementById('mobile-climbs-count');
  if (mobileClimbsCount) mobileClimbsCount.textContent = `${climbsCount}`;

  const mobileFuelCount = document.getElementById('mobile-fuel-count');
  if (mobileFuelCount) mobileFuelCount.textContent = `${fuelCount}`;

  if (hasData) {
    const distFormatted = `${(stats.totalDist * dFactor).toFixed(1)} ${distUnit}`;
    const gainFormatted = formatElevation(stats.elevGain, cfg.units, true);
    const maxGradeFormatted = `${stats.maxGrade.toFixed(1)}%`;

    const statDist = document.getElementById('stat-dist');
    const statGain = document.getElementById('stat-gain');
    const statMaxGrade = document.getElementById('stat-max-grade');
    const statClimbs = document.getElementById('stat-climbs');

    if (statDist) statDist.textContent = distFormatted;
    if (statGain) statGain.textContent = gainFormatted;
    if (statMaxGrade) statMaxGrade.textContent = maxGradeFormatted;
    if (statClimbs) statClimbs.textContent = `${climbsCount}`;

    // Fueling mode telemetry stats
    const fuelItems = (state.fueling && state.fueling.items) ? state.fueling.items.filter(it => it.enabled !== false) : [];
    const totalCarbs = fuelItems.reduce((acc, it) => acc + (it.carbsG || 0), 0);
    const totalHours = (stats && stats.totalDist > 0) ? getStatePacing(state).totalSec / 3600 : 0;
    const avgCarbsPerHour = totalHours > 0 ? Math.round(totalCarbs / totalHours) : 0;
    const durHrs = Math.floor(totalHours);
    const durMin = Math.round((totalHours - durHrs) * 60);
    const timeStr = `${durHrs}h ${durMin.toString().padStart(2, '0')}m`;

    const statFuelDist = document.getElementById('stat-fuel-dist');
    const statFuelTime = document.getElementById('stat-fuel-time');
    const statFuelCarbs = document.getElementById('stat-fuel-carbs');
    const statFuelRate = document.getElementById('stat-fuel-rate');

    if (statFuelDist) statFuelDist.textContent = distFormatted;
    if (statFuelTime) statFuelTime.textContent = timeStr;
    if (statFuelCarbs) statFuelCarbs.textContent = `${totalCarbs}g CHO`;
    if (statFuelRate) statFuelRate.textContent = `${avgCarbsPerHour}g/h`;

    if (routeStatusText) {
      const title = cfg.title || 'Active Track';
      routeStatusText.textContent = `${title} · ${distFormatted} · ${gainFormatted}`;
    }
  } else {
    ['stat-dist', 'stat-gain', 'stat-max-grade', 'stat-climbs', 'stat-fuel-dist', 'stat-fuel-time', 'stat-fuel-carbs', 'stat-fuel-rate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
    if (routeStatusText) {
      routeStatusText.textContent = 'No track loaded';
    }
  }
}
