/**
 * Spherical geodesy (Haversine distance) and elevation interpolation along a profile.
 *
 * @module signal/geo
 */

/** Radius of the Earth in meters for spherical geodesy */
export const EARTH_RADIUS_METERS = 6371000;

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
