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
  stickerType: 'active', // 'active', 'elevation', 'fueling', 'both', 'climbs'
  showCropMarks: true,
  showCutLines: true,
  showRuler: true,
  showHeader: true,
  paper: 'a4', // 'a4', 'letter'
  orientation: 'auto' // 'auto', 'portrait', 'landscape'
};

/**
 * Paper format dimensions in millimeters.
 */
export const PAPER_DIMENSIONS = {
  a4: { widthMm: 210, heightMm: 297, name: 'A4' },
  letter: { widthMm: 215.9, heightMm: 279.4, name: 'US Letter' }
};

/** Page margin in mm, shared by the printed page and its preview. */
export const PRINT_PAGE_MARGIN_MM = 8;

/**
 * Resolves the physical page for a print sheet. 'auto' stays portrait unless a
 * sticker cell only fits across the long edge.
 *
 * @param {{ paper?: string, orientation?: string }} config - Print configuration
 * @param {number} cellWidthMm - Width of one sticker cell including crop marks
 * @returns {{ widthMm: number, heightMm: number }} Page size
 */
export function resolvePageSize(config, cellWidthMm) {
  const paper = PAPER_DIMENSIONS[config.paper] || PAPER_DIMENSIONS.a4;
  const portraitFits = cellWidthMm <= paper.widthMm - PRINT_PAGE_MARGIN_MM * 2;
  const landscape = config.orientation === 'landscape' || (config.orientation !== 'portrait' && !portraitFits);
  return landscape
    ? { widthMm: paper.heightMm, heightMm: paper.widthMm }
    : { widthMm: paper.widthMm, heightMm: paper.heightMm };
}

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
      climbDetail: Boolean(pointsOrOptions.climbDetail),
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
