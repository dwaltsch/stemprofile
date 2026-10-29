/**
 * Vector SVG Profile Renderer Module
 *
 * Generates millimeter-accurate, print-ready SVG elevation profiles for
 * top tubes and bicycle stems. Supports both block-segmented Grand Tour roadbook
 * mode (2.5km, 1.0km, 500m, custom) and smooth continuous elevation curves.
 *
 * Features:
 * - Anti-collision, multi-tier climb summit badge layout engine with leader lines
 * - In-block gradient percentage rendering with adaptive orientation
 * - High-contrast feed zone, water, sprint, and hazard waypoints
 * - Metric (km/m) and Imperial (mi/ft) unit systems
 * - Light (Print White) and Dark (Cockpit) theme palettes
 *
 * @module renderer
 */

import { escapeXml } from './escape.js';
import {
  createProfileContext,
  renderBlockColumns,
  renderSmoothProfile,
  renderDistanceTicks,
  renderElevationLabels,
  renderClimbs,
  renderWaypoints,
  renderHeader,
  renderCutGuide
} from './renderer/profile-layers.js';

export * from './renderer/themes.js';
export { WAYPOINT_CONFIG } from './renderer/waypoints-config.js';

export { escapeXml };

// Re-export layout computation for backward compatibility
export { computeClimbBadgeLayout, computeBlockPctLayout } from './layout.js';

/**
 * Main vector SVG rendering pipeline for elevation stickers.
 *
 * Supports both standard options object `{ points, stats, climbs, blocks, waypoints, settings, isPrint }`
 * and positional parameters for full backward compatibility.
 *
 * @param {import('./signal.js').ProfilePoint[]|Object} pointsOrOptions - Filtered route points or options object
 * @param {import('./signal.js').RouteStats} [stats] - Telemetry metrics
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} [settings={}] - User configuration settings
 * @param {boolean} [isPrint=false] - When true, forces print-optimized white theme
 * @returns {string} Pure vector SVG XML markup
 */
export function renderProfileSVG(
  pointsOrOptions,
  stats,
  climbs = [],
  blocks = [],
  waypoints = [],
  settings = {},
  isPrint = false
) {
  let points;

  // Polymorphic parameter resolution (support options object or positional arguments)
  if (pointsOrOptions && !Array.isArray(pointsOrOptions) && typeof pointsOrOptions === 'object' && pointsOrOptions.points) {
    const opts = pointsOrOptions;
    points = opts.points;
    stats = opts.stats;
    climbs = opts.climbs || [];
    blocks = opts.blocks || [];
    waypoints = opts.waypoints || [];
    settings = opts.settings || {};
    isPrint = opts.isPrint || false;
  } else {
    points = pointsOrOptions;
    if (!Array.isArray(waypoints) && typeof waypoints === 'object') {
      isPrint = settings === true;
      settings = waypoints;
      waypoints = settings.waypoints || [];
    }
  }

  const ctx = createProfileContext(points, stats, climbs, blocks, waypoints, settings, isPrint);
  const { W, H, radius, theme } = ctx;

  if (!points || points.length < 2 || !stats) {
    return `<svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      <text x="50%" y="50%" fill="${theme.textMuted}" text-anchor="middle" font-size="3" font-weight="700" font-family="system-ui, -apple-system, sans-serif">Drop route (GPX, TCX, FIT) to render profile</text>
    </svg>`;
  }

  const profile = blocks && blocks.length > 0 ? renderBlockColumns(ctx) : renderSmoothProfile(ctx);

  return `
    <svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <defs>
        <linearGradient id="climb-active-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.08"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      ${renderDistanceTicks(ctx)}
      ${profile.body}
      <path d="${profile.topPath}" fill="none" stroke="${theme.topStroke}" stroke-width="0.75" stroke-linejoin="round" stroke-linecap="round"/>
      ${renderElevationLabels(ctx)}
      ${renderClimbs(ctx)}
      ${renderWaypoints(ctx)}
      ${renderHeader(ctx)}
      ${renderCutGuide(ctx)}
    </svg>
  `.trim();
}
