/**
 * Distance to elapsed-time pacing conversion and time formatting.
 *
 * @module fueling/timing
 */

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
export function distToElapsedSeconds(distM, avgSpeedKmh, stopSec = 0) {
  const safeSpeed = Math.max(5, avgSpeedKmh || 25);
  const distKm = distM / 1000;
  return Math.round((distKm / safeSpeed) * 3600) + Math.round(stopSec || 0);
}
