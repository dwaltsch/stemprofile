/**
 * Units, Telemetry Formatting & Coordinate Normalization Module
 *
 * Provides standardized geodesy conversions, unit system scaling (Metric / Imperial),
 * telemetry label formatters, and coordinate normalization helpers.
 *
 * @module units
 */

/** Conversion factor from meters to kilometers */
export const D_FACTOR_METRIC = 1 / 1000;

/** Conversion factor from meters to miles */
export const D_FACTOR_IMPERIAL = 1 / 1609.344;

/** Conversion factor from meters to meters (1:1) */
export const E_FACTOR_METRIC = 1.0;

/** Conversion factor from meters to feet */
export const E_FACTOR_IMPERIAL = 3.280839895;

/**
 * @typedef {'metric'|'imperial'} UnitSystem
 */

/**
 * @typedef {Object} UnitLabels
 * @property {string} dist - Distance unit label ('km' or 'mi')
 * @property {string} ele - Elevation unit label ('m' or 'ft')
 * @property {string} distShort - Short distance tag ('k' or 'm')
 */

/**
 * Returns unit system labels for distance and elevation.
 *
 * @param {UnitSystem} [units='metric'] - Measurement system
 * @returns {UnitLabels} Unit label strings
 */
export function getUnitLabels(units = 'metric') {
  const isMetric = units !== 'imperial';
  return {
    dist: isMetric ? 'km' : 'mi',
    ele: isMetric ? 'm' : 'ft',
    distShort: isMetric ? 'k' : 'm'
  };
}

/**
 * Returns distance and elevation scaling factors for the given unit system.
 *
 * @param {UnitSystem} [units='metric'] - Measurement system
 * @returns {{ dFactor: number, eFactor: number }} Scaling multiplier factors
 */
export function getUnitFactors(units = 'metric') {
  const isMetric = units !== 'imperial';
  return {
    dFactor: isMetric ? D_FACTOR_METRIC : D_FACTOR_IMPERIAL,
    eFactor: isMetric ? E_FACTOR_METRIC : E_FACTOR_IMPERIAL
  };
}

/**
 * Formats track distance in meters to a localized unit string (e.g. "45.2 km" or "28.1 mi").
 *
 * @param {number} meters - Distance in meters
 * @param {UnitSystem} [units='metric'] - Measurement system
 * @param {number} [decimals=1] - Decimal precision
 * @returns {string} Formatted distance string with unit
 */
export function formatDistance(meters, units = 'metric', decimals = 1) {
  const { dFactor } = getUnitFactors(units);
  const labels = getUnitLabels(units);
  const val = (meters * dFactor).toFixed(decimals);
  return `${val} ${labels.dist}`;
}

/**
 * Formats vertical elevation in meters to a localized unit string (e.g. "+1,250 m" or "+4,101 ft").
 *
 * @param {number} meters - Elevation or gain in meters
 * @param {UnitSystem} [units='metric'] - Measurement system
 * @param {boolean} [includeSign=false] - Whether to prefix with '+' for positive values
 * @returns {string} Formatted elevation string with unit
 */
export function formatElevation(meters, units = 'metric', includeSign = false) {
  const { eFactor } = getUnitFactors(units);
  const labels = getUnitLabels(units);
  const rounded = Math.round(meters * eFactor);
  const sign = includeSign && rounded > 0 ? '+' : '';
  return `${sign}${rounded} ${labels.ele}`;
}

/**
 * Formats gradient percentage to a localized string (e.g. "8.5%" or "Max 14.2%").
 *
 * @param {number} gradePct - Gradient percentage
 * @param {number} [decimals=1] - Decimal precision
 * @param {string} [prefix=''] - Optional prefix (e.g. 'Max ')
 * @returns {string} Formatted gradient string
 */
export function formatGrade(gradePct, decimals = 1, prefix = '') {
  const val = (gradePct || 0).toFixed(decimals);
  return `${prefix}${val}%`;
}

/**
 * @typedef {Object} NormalizedCoordinate
 * @property {number} lat - Latitude in decimal degrees
 * @property {number} lon - Longitude in decimal degrees
 * @property {number} ele - Elevation in meters
 * @property {number} [dist] - Cumulative distance in meters
 */

/**
 * Standardizes coordinate input into uniform {lat, lon, ele} objects.
 * Handles array tuples [lat, lon, ele], objects {lat, lon, ele}, or synthetic distance coords {dist, ele}.
 *
 * @param {Array<Object|Array<number>>} rawCoords - Raw coordinates in any supported format
 * @returns {NormalizedCoordinate[]} Normalized coordinates
 */
export function normalizeCoordinates(rawCoords) {
  if (!rawCoords || !Array.isArray(rawCoords)) return [];

  return rawCoords.map(c => {
    if (Array.isArray(c)) {
      return {
        lat: Number(c[0]) || 0,
        lon: Number(c[1]) || 0,
        ele: c[2] !== undefined ? Number(c[2]) : 0
      };
    }
    if (c && typeof c === 'object') {
      if (c.dist !== undefined) {
        return {
          dist: Number(c.dist) || 0,
          lat: c.lat !== undefined ? Number(c.lat) : (Number(c.dist) / 111319.5),
          lon: c.lon !== undefined ? Number(c.lon) : 0,
          ele: c.ele !== undefined ? Number(c.ele) : (c.smoothEle !== undefined ? Number(c.smoothEle) : 0)
        };
      }
      return {
        lat: Number(c.lat) || 0,
        lon: Number(c.lon) || 0,
        ele: c.ele !== undefined ? Number(c.ele) : 0
      };
    }
    return { lat: 0, lon: 0, ele: 0 };
  });
}
