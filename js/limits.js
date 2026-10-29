/**
 * Input Limits Module
 *
 * Upper bounds on untrusted input (route files, shared links, text fields).
 * Each limit is far above what a real route needs; they exist so a broken or
 * hostile input cannot freeze the tab or bloat the stickers.
 *
 * @module limits
 */

/** Largest route file read (bytes). Real GPX / TCX / FIT files are well under 10 MB. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Most track points kept; larger tracks are thinned preserving elevation extremes. */
export const MAX_TRACK_POINTS = 100000;

/** Most GPX / TCX / FIT waypoints imported (matching is O(waypoints x points)). */
export const MAX_IMPORTED_WAYPOINTS = 500;

/** Longest route title kept (characters). */
export const MAX_TITLE_CHARS = 120;

/** Longest waypoint name / description kept (characters). */
export const MAX_LABEL_CHARS = 100;

/**
 * Truncates a value to a string of at most `max` characters ('' for null / undefined).
 *
 * @param {*} value
 * @param {number} max
 * @returns {string}
 */
export function clampText(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, max);
}
