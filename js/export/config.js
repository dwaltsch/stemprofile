/**
 * Print defaults, paper formats and polymorphic export argument resolution shared by all export pipelines.
 *
 * @module export/config
 */

/**
 * Standard default print configuration dictionary.
 */
export const DEFAULT_PRINT_CONFIG = {
  copies: 2,
  printTheme: 'theme', // 'theme' (active color palette) or 'white' (ink-saver)
  stickerType: 'active', // 'active', 'elevation', 'fueling', 'both'
  showCropMarks: true,
  showCutLines: true,
  showRuler: true,
  showHeader: true,
  paper: 'a4', // 'a4', 'letter', 'compact'
  orientation: 'auto' // 'auto', 'portrait', 'landscape'
};

/**
 * Paper format dimensions in millimeters.
 */
export const PAPER_DIMENSIONS = {
  a4: { widthMm: 210, heightMm: 297, name: 'A4' },
  letter: { widthMm: 215.9, heightMm: 279.4, name: 'US Letter' },
  compact: { widthMm: 0, heightMm: 0, name: 'Compact' }
};

/**
 * Normalizes polymorphic arguments (options object vs positional parameters) for export functions.
 *
 * @private
 */
export function resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings, callback) {
  if (pointsOrOptions && typeof pointsOrOptions === 'object' && !Array.isArray(pointsOrOptions) && pointsOrOptions.points) {
    return {
      points: pointsOrOptions.points,
      stats: pointsOrOptions.stats || null,
      climbs: pointsOrOptions.climbs || [],
      blocks: pointsOrOptions.blocks || [],
      waypoints: pointsOrOptions.waypoints || [],
      settings: pointsOrOptions.settings || {},
      fueling: pointsOrOptions.fueling || null,
      activeView: pointsOrOptions.activeView || 'elevation',
      callback: typeof stats === 'function' ? stats : (pointsOrOptions.callback || null)
    };
  }

  // Handle legacy polymorphic signatures where waypoints was passed as settings
  let resolvedWaypoints = Array.isArray(waypoints) ? waypoints : [];
  let resolvedSettings = (typeof settings === 'object' && settings !== null && !Array.isArray(settings)) ? settings : {};
  let resolvedCallback = typeof callback === 'function' ? callback : null;

  if (!Array.isArray(waypoints) && typeof waypoints === 'object' && waypoints !== null) {
    resolvedSettings = waypoints;
    resolvedCallback = typeof settings === 'function' ? settings : null;
  } else if (typeof settings === 'function') {
    resolvedCallback = settings;
    resolvedSettings = {};
  }

  return {
    points: Array.isArray(pointsOrOptions) ? pointsOrOptions : [],
    stats: stats || null,
    climbs: climbs || [],
    blocks: blocks || [],
    waypoints: resolvedWaypoints,
    settings: resolvedSettings,
    callback: resolvedCallback
  };
}
