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

/** Plausible elevation range on Earth in meters (Dead Sea shore to above Everest). */
export const ELEVATION_RANGE_M = [-500, 9000];

/**
 * Standardizes coordinate input into uniform {lat, lon, ele} objects.
 * Handles array tuples [lat, lon, ele], objects {lat, lon, ele}, or synthetic distance coords {dist, ele}.
 *
 * Input from files and shared links is untrusted, so:
 * - entries that are not arrays / objects (null, strings, ...) are skipped
 * - points with non-finite or out-of-range latitude / longitude (or a negative
 *   / non-finite synthetic distance) are dropped
 * - non-finite or physically implausible elevations are filled from the nearest
 *   valid elevation (previous one, or the first valid one for a leading gap);
 *   with no valid elevation at all, 0 is used
 *
 * @param {Array<Object|Array<number>>} rawCoords - Raw coordinates in any supported format
 * @returns {NormalizedCoordinate[]} Normalized coordinates
 */
export function normalizeCoordinates(rawCoords) {
  if (!rawCoords || !Array.isArray(rawCoords)) return [];

  const [minEle, maxEle] = ELEVATION_RANGE_M;
  const validEle = e => Number.isFinite(e) && e >= minEle && e <= maxEle;
  const out = [];

  for (const c of rawCoords) {
    let pt = null;
    if (Array.isArray(c)) {
      pt = { lat: Number(c[0]), lon: Number(c[1]), ele: c[2] !== undefined ? Number(c[2]) : NaN };
    } else if (c && typeof c === 'object') {
      if (c.dist !== undefined) {
        const dist = Number(c.dist);
        if (!Number.isFinite(dist) || dist < 0) continue;
        pt = {
          dist,
          lat: c.lat !== undefined ? Number(c.lat) : (dist / 111319.5),
          lon: c.lon !== undefined ? Number(c.lon) : 0,
          ele: c.ele !== undefined ? Number(c.ele) : (c.smoothEle !== undefined ? Number(c.smoothEle) : NaN)
        };
        // Synthetic distance coords carry placeholder lat/lon; only require them to be finite
        if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) continue;
        out.push(pt);
        continue;
      }
      pt = { lat: Number(c.lat), lon: Number(c.lon), ele: c.ele !== undefined ? Number(c.ele) : NaN };
    }
    if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) continue;
    if (Math.abs(pt.lat) > 90 || Math.abs(pt.lon) > 180) continue;
    out.push(pt);
  }

  // Fill missing / implausible elevations from neighbours
  const firstValid = out.find(p => validEle(p.ele));
  let lastEle = firstValid ? firstValid.ele : 0;
  for (const p of out) {
    if (validEle(p.ele)) lastEle = p.ele;
    else p.ele = lastEle;
  }
  return out;
}

/**
 * Whether normalized coordinates describe a route with length: at least two
 * points at different positions (or synthetic distances).
 *
 * @param {NormalizedCoordinate[]} coords - Normalized coordinates
 * @returns {boolean}
 */
export function hasRouteLength(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const first = coords[0];
  return coords.some(c => c.lat !== first.lat || c.lon !== first.lon || (c.dist !== undefined && c.dist !== first.dist));
}

/**
 * Route length in meters: great-circle sum for GPS coordinates, or the last
 * distance for synthetic distance-based coordinates.
 *
 * @param {NormalizedCoordinate[]} coords - Normalized coordinates
 * @returns {number}
 */
export function routeLengthM(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  if (coords[0].dist !== undefined) return coords[coords.length - 1].dist - coords[0].dist;
  const rad = d => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    total += 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return total;
}
