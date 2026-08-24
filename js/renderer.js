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

import { getInterpolatedEle } from './signal.js';
import { computeClimbBadgeLayout, calculateLeaderLineAnchor, computeBlockPctLayout } from './layout.js';
import { getUnitFactors, getUnitLabels, formatElevation } from './units.js';

// Re-export layout computation for backward compatibility
export { computeClimbBadgeLayout, computeBlockPctLayout } from './layout.js';

/**
 * @typedef {Object} RenderTheme
 * @property {string} name - Human-readable theme name
 * @property {string} bg - Background color hex
 * @property {string} text - Primary high-contrast text color
 * @property {string} textMuted - Secondary muted text color
 * @property {string} grid - Elevation and distance grid line color
 * @property {string} topStroke - Profile skyline stroke color
 * @property {string} divider - Segment block divider line color
 * @property {string} blockStroke - Segment block border stroke color
 * @property {string} badgeBg - Climb and waypoint badge background fill
 * @property {string} badgeStroke - Climb and waypoint badge border stroke
 * @property {string} badgeText - Climb and waypoint badge text color
 * @property {string} cutLine - Scissor guideline dashed stroke color
 * @property {string} z1 - Zone 1 (<5%) color hex (Emerald Green)
 * @property {string} z2 - Zone 2 (5-8%) color hex (Amber Yellow)
 * @property {string} z3 - Zone 3 (8-12%) color hex (Deep Orange)
 * @property {string} z4 - Zone 4 (>12%) color hex (Crimson Red)
 */

/**
 * Available color themes for stickers and print exports
 * @type {Record<'white'|'dark'|'tour'|'neon'|'giro'|'gravel', RenderTheme>}
 */
export const THEMES = {
  'white': {
    name: 'Print White',
    bg: '#ffffff',
    text: '#0f172a',          // Crisp deep slate/black
    textMuted: '#334155',     // High-contrast slate 700
    grid: 'rgba(15, 23, 42, 0.16)',
    topStroke: '#0f172a',
    divider: '#ffffff',
    blockStroke: 'rgba(15, 23, 42, 0.35)',
    badgeBg: '#ffffff',
    badgeStroke: '#0f172a',
    badgeText: '#0f172a',
    cutLine: 'rgba(15, 23, 42, 0.35)',
    z1: '#16a34a',            // Emerald Green
    z2: '#d97706',            // Rich Amber
    z3: '#ea580c',            // Deep Orange
    z4: '#dc2626'             // Bold Crimson Red
  },
  'giro': {
    name: 'Giro Rosa (Gazzetta Pink)',
    bg: '#fff0f3',            // Signature Gazzetta Dello Sport warm pink paper
    text: '#4c0519',          // Deep Italian racing burgundy / espresso
    textMuted: '#881337',     // Rose Slate
    grid: 'rgba(136, 19, 55, 0.16)',
    topStroke: '#4c0519',
    divider: '#fff0f3',
    blockStroke: 'rgba(76, 5, 25, 0.35)',
    badgeBg: '#ffffff',
    badgeStroke: '#be185d',   // Iconic Maglia Rosa Magenta
    badgeText: '#4c0519',
    cutLine: 'rgba(190, 24, 93, 0.40)',
    z1: '#059669',            // Italian Alpine Mint
    z2: '#d97706',            // Tuscan Ochre
    z3: '#ea580c',            // Dolomite Terracotta
    z4: '#be123c'             // Giro Rose Crimson
  },
  'tour': {
    name: 'Tour de France (L\'Étape Gold)',
    bg: '#ffffff',
    text: '#000000',          // Pure Jet Black for 21:1 sunlight contrast
    textMuted: '#27272a',     // Asphalt Dark
    grid: 'rgba(0, 0, 0, 0.20)',
    topStroke: '#000000',
    divider: '#ffffff',
    blockStroke: 'rgba(0, 0, 0, 0.50)',
    badgeBg: '#fef08a',       // Maillot Jaune Gold Badge Fill
    badgeStroke: '#000000',
    badgeText: '#000000',
    cutLine: 'rgba(0, 0, 0, 0.45)',
    z1: '#16a34a',            // French Meadow Green
    z2: '#eab308',            // Tour Gold
    z3: '#f97316',            // Alpine Orange
    z4: '#dc2626'             // Pois Rouges Red
  },
  'gravel': {
    name: 'Gravel Brevet (Expedition Sand)',
    bg: '#f5efe6',            // Warm desert parchment / sand
    text: '#1c1917',          // Deep espresso / earth
    textMuted: '#57534e',     // Stone Slate
    grid: 'rgba(41, 37, 36, 0.18)',
    topStroke: '#292524',
    divider: '#f5efe6',
    blockStroke: 'rgba(41, 37, 36, 0.35)',
    badgeBg: '#fffbf5',
    badgeStroke: '#78350f',   // Cognac leather brown
    badgeText: '#1c1917',
    cutLine: 'rgba(120, 53, 15, 0.40)',
    z1: '#4d7c0f',            // Forest Moss / Sage
    z2: '#b45309',            // Desert Clay / Ochre
    z3: '#c2410c',            // Burnt Sienna / Rust
    z4: '#7f1d1d'             // Deep Mahogany
  },
  'dark': {
    name: 'Dark Cockpit',
    bg: '#0d1117',
    text: '#f8fafc',          // Pure bright text
    textMuted: '#94a3b8',     // Slate 400
    grid: 'rgba(255, 255, 255, 0.15)',
    topStroke: '#ffffff',
    divider: '#0d1117',
    blockStroke: 'rgba(0, 0, 0, 0.5)',
    badgeBg: '#161b22',
    badgeStroke: '#475569',
    badgeText: '#f8fafc',
    cutLine: 'rgba(255, 255, 255, 0.25)',
    z1: '#22c55e',            // Bright Green
    z2: '#eab308',            // Bright Yellow
    z3: '#f97316',            // Bright Orange
    z4: '#ef4444'             // Bright Red
  },
  'neon': {
    name: 'Cyberpunk Neon (OLED Black)',
    bg: '#000000',            // True OLED Pitch Black
    text: '#ffffff',          // Pure Stark White
    textMuted: '#94a3b8',     // Slate 400
    grid: 'rgba(56, 189, 248, 0.18)',
    topStroke: '#38bdf8',     // Laser Sky Cyan
    divider: '#000000',
    blockStroke: 'rgba(0, 0, 0, 0.9)',
    badgeBg: '#090d16',
    badgeStroke: '#38bdf8',
    badgeText: '#ffffff',
    cutLine: 'rgba(56, 189, 248, 0.4)',
    z1: '#06b6d4',            // Electric Cyan (<5%)
    z2: '#a3e635',            // Acid Lime (5-8%)
    z3: '#fb923c',            // Electric Blaze Amber (8-12%)
    z4: '#f43f5e'             // Ultraviolet Hot Pink (>12%)
  }
};

/**
 * Resolves the categorical color for a climb's summit pill badge based on UCI severity.
 *
 * @param {string} category - Climb category (HC, Cat 1, Cat 2, Cat 3, Cat 4)
 * @param {RenderTheme} theme - Active color theme
 * @returns {string} Hex color string
 */
export function getClimbCategoryColor(category, theme) {
  const cat = (category || '').toUpperCase();
  if (cat.includes('HC') || cat.includes('1')) return theme.z4 || '#dc2626';
  if (cat.includes('2')) return theme.z3 || '#ea580c';
  if (cat.includes('3')) return theme.z2 || '#d97706';
  return theme.z1 || '#16a34a';
}

/**
 * Visual styling and iconography configuration for race waypoints and nutrition cues
 */
export const WAYPOINT_CONFIG = {
  feed: {
    label: 'Feed Zone',
    color: '#f97316',      // Vivid Orange
    textColor: '#ffffff',
    shortCode: 'FEED'
  },
  water: {
    label: 'Water / H2O',
    color: '#0284c7',      // Bright Sky Blue
    textColor: '#ffffff',
    shortCode: 'H2O'
  },
  food: {
    label: 'Food / Fuel',
    color: '#eab308',      // Amber Yellow
    textColor: '#000000',
    shortCode: 'GEL'
  },
  sprint: {
    label: 'Sprint',
    color: '#16a34a',      // Emerald Green
    textColor: '#ffffff',
    shortCode: 'SPRINT'
  },
  summit: {
    label: 'Summit',
    color: '#dc2626',      // Red
    textColor: '#ffffff',
    shortCode: 'SUMMIT'
  },
  caution: {
    label: 'Caution / Hazard',
    color: '#f59e0b',      // Warning Amber
    textColor: '#000000',
    shortCode: 'CAUTION'
  },
  mech: {
    label: 'Tech / Mech',
    color: '#06b6d4',      // Cyan
    textColor: '#ffffff',
    shortCode: 'TECH'
  },
  checkpoint: {
    label: 'Checkpoint',
    color: '#9333ea',      // Purple
    textColor: '#ffffff',
    shortCode: 'CP'
  },
  custom: {
    label: 'Pin',
    color: '#db2777',      // Pink / Magenta
    textColor: '#ffffff',
    shortCode: 'PIN'
  }
};

/**
 * Generates vector glyph paths for waypoint pins.
 *
 * @param {string} type - Waypoint category type identifier
 * @param {string} [textColor='#ffffff'] - Glyph icon fill/stroke color
 * @returns {string} SVG path/polygon markup centered at origin (0,0)
 */
function renderWaypointGlyph(type, textColor = '#ffffff') {
  switch (type) {
    case 'water':
      return `<path d="M 0,-1.3 C 0,-1.3 1.0,0.1 1.0,0.8 C 1.0,1.4 0.5,1.8 0,1.8 C -0.5,1.8 -1.0,1.4 -1.0,0.8 C -1.0,0.1 0,-1.3 0,-1.3 Z" fill="${textColor}"/>`;
    case 'food':
      return `<path d="M 0.2,-1.4 L -0.9,0.1 L 0,0.1 L -0.2,1.4 L 0.9,-0.1 L 0,-0.1 Z" fill="${textColor}"/>`;
    case 'feed':
      return `<path d="M -1.1,-0.5 L 1.1,-0.5 L 0.9,1.3 L -0.9,1.3 Z" fill="${textColor}"/><path d="M -1.1,-0.5 L 0,-1.4 L 1.1,-0.5" fill="none" stroke="${textColor}" stroke-width="0.3"/>`;
    case 'sprint':
      return `<text x="0" y="1.0" font-size="2.7" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="${textColor}">S</text>`;
    case 'summit':
      return `<polygon points="0,-1.4 1.4,1.2 -1.4,1.2" fill="${textColor}"/>`;
    case 'caution':
      return `<polygon points="0,-1.4 1.3,1.2 -1.3,1.2" fill="${textColor}"/><line x1="0" y1="-0.5" x2="0" y2="0.3" stroke="#000000" stroke-width="0.38" stroke-linecap="round"/><circle cx="0" cy="0.8" r="0.22" fill="#000000"/>`;
    case 'mech':
      return `<path d="M -0.7,-1.0 L 0.7,0.4 L 0.4,0.7 L -1.0,-0.7 Z" fill="${textColor}" stroke="${textColor}" stroke-width="0.2"/><circle cx="0.7" cy="0.7" r="0.5" fill="${textColor}"/>`;
    case 'checkpoint':
      return `<path d="M -0.8,-1.2 L 1.0,-0.7 L -0.8,-0.2 Z" fill="${textColor}"/><line x1="-0.8" y1="-1.2" x2="-0.8" y2="1.3" stroke="${textColor}" stroke-width="0.32"/>`;
    default:
      return `<circle cx="0" cy="-0.2" r="1.0" fill="${textColor}"/><line x1="0" y1="0.8" x2="0" y2="1.4" stroke="${textColor}" stroke-width="0.32"/>`;
  }
}

/**
 * Escapes unsafe characters for XML/SVG text embedding.
 *
 * @param {string} s - Input text string
 * @returns {string} Sanitized XML-safe string
 */
export function escapeXml(s) {
  const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
  return (s || '').replace(/[<>&'"]/g, c => map[c] || c);
}

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

  const W = settings.widthMm || 110;
  const H = settings.heightMm || 35;
  const radius = settings.radiusMm || 0;
  const themeKey = isPrint ? 'white' : (THEMES[settings.theme] ? settings.theme : (settings.theme === 'dark' ? 'dark' : 'white'));
  const theme = THEMES[themeKey] || THEMES['white'];

  if (!points || points.length < 2 || !stats) {
    return `<svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      <text x="50%" y="50%" fill="${theme.textMuted}" text-anchor="middle" font-size="3" font-weight="700" font-family="system-ui, -apple-system, sans-serif">Drop GPX to render profile</text>
    </svg>`;
  }

  const { dFactor, eFactor } = getUnitFactors(settings.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(settings.units);

  const totalDistU = stats.totalDist * dFactor;
  const elevGainU = stats.elevGain * eFactor;
  const minEleU = stats.minEle * eFactor;
  const maxEleU = stats.maxEle * eFactor;

  // SVG Geometry Layout Bounds
  const padLeft = 7.5;
  const padRight = 5.0;
  const padTop = settings.showHeader ? 7.2 : 3.0;
  const padBottom = 4.2;

  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const yBase = padTop + plotH;

  // Add 10% elevation headroom
  const eleHeadroom = (stats.maxEle - stats.minEle) * 0.10;
  const minElePlot = Math.max(0, stats.minEle - eleHeadroom);
  const maxElePlot = stats.maxEle + eleHeadroom;
  const eleSpan = Math.max(1, maxElePlot - minElePlot);

  const toX = distM => padLeft + (distM / stats.totalDist) * plotW;
  const toY = eleM => yBase - ((eleM - minElePlot) / eleSpan) * plotH;

  const zoneColors = [theme.z1, theme.z2, theme.z3, theme.z4];
  let profileBodyMarkup = '';
  let topPath = '';

  const isBlockMode = blocks && blocks.length > 0;

  if (isBlockMode) {
    // 1. Render Segmented Block Columns (2.5km / 1.0km / 500m / Custom)
    let blocksPolygons = '';
    let blockDividers = '';
    let blockTextLabels = '';

    topPath = `M ${toX(blocks[0].startDist).toFixed(2)} ${toY(blocks[0].startEle).toFixed(2)}`;

    // Stride & density calculation so percentage numbers never clutter or overlap
    const avgBlockWidthMm = plotW / Math.max(1, blocks.length);
    const baseStride = avgBlockWidthMm >= 3.2 ? 1 : (avgBlockWidthMm >= 1.6 ? 2 : Math.max(2, Math.ceil(3.2 / avgBlockWidthMm)));
    let lastRenderedTextX = -999;

    blocks.forEach((b, idx) => {
      const x1 = toX(b.startDist);
      const x2 = toX(b.endDist);
      const y1 = toY(b.startEle);
      const y2 = toY(b.endEle);
      const blockWidthMm = x2 - x1;

      topPath += ` L ${x2.toFixed(2)} ${y2.toFixed(2)}`;

      // Block Trapezoid (Adaptive border to preserve color visibility on narrow blocks)
      const polyStrokeWidth = blockWidthMm >= 1.5 ? 0.2 : (blockWidthMm >= 0.8 ? 0.08 : 0);
      const polyStrokeAttr = polyStrokeWidth > 0 ? `stroke="${theme.blockStroke}" stroke-width="${polyStrokeWidth}"` : '';

      blocksPolygons += `
        <polygon points="${x1.toFixed(2)},${yBase.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x2.toFixed(2)},${yBase.toFixed(2)}" fill="${zoneColors[b.zone]}" ${polyStrokeAttr}/>
      `;

      // Vertical Block Divider Line: hairline scaling to never whiteout narrow blocks
      if (idx > 0 && blockWidthMm >= 1.2) {
        const divWidth = Math.min(0.3, Math.max(0.1, blockWidthMm * 0.12));
        blockDividers += `
          <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${yBase.toFixed(2)}" stroke="${theme.divider}" stroke-width="${divWidth.toFixed(2)}"/>
        `;
      }

      // Block Percentage Text (Dynamic responsive roadbook rendering based on sticker size)
      if (settings.showBlockPct !== false) {
        const topMidY = (y1 + y2) / 2;
        const colHeight = yBase - topMidY;
        const midX = (x1 + x2) / 2;

        const pctResult = computeBlockPctLayout({
          block: b,
          idx,
          baseStride,
          blockWidthMm,
          colHeight,
          topMidY,
          yBase,
          midX,
          lastRenderedTextX,
          widthMm: W,
          heightMm: H,
          themeKey
        });

        if (pctResult.shouldRender) {
          blockTextLabels += pctResult.markup;
          lastRenderedTextX = pctResult.nextRenderedTextX;
        }
      }
    });

    profileBodyMarkup = blocksPolygons + blockDividers + blockTextLabels;

  } else {
    // 2. Smooth Continuous Gradient Path (Fallback / Continuous Mode)
    const gradId = `profile-grad-${Math.random().toString(36).substr(2, 6)}`;
    let gradientStops = '';
    let prevZone = points[0].zone;
    gradientStops += `<stop offset="0%" stop-color="${zoneColors[prevZone]}"/>`;

    for (let i = 1; i < points.length; i++) {
      const pt = points[i];
      if (pt.zone !== prevZone) {
        const pct = ((pt.dist / stats.totalDist) * 100).toFixed(2);
        gradientStops += `<stop offset="${pct}%" stop-color="${zoneColors[prevZone]}"/>`;
        gradientStops += `<stop offset="${pct}%" stop-color="${zoneColors[pt.zone]}"/>`;
        prevZone = pt.zone;
      }
    }
    gradientStops += `<stop offset="100%" stop-color="${zoneColors[prevZone]}"/>`;

    let polyPath = `M ${toX(points[0].dist).toFixed(2)} ${yBase.toFixed(2)}`;
    polyPath += ` L ${toX(points[0].dist).toFixed(2)} ${toY(points[0].smoothEle).toFixed(2)}`;
    topPath = `M ${toX(points[0].dist).toFixed(2)} ${toY(points[0].smoothEle).toFixed(2)}`;

    for (let i = 1; i < points.length; i++) {
      polyPath += ` L ${toX(points[i].dist).toFixed(2)} ${toY(points[i].smoothEle).toFixed(2)}`;
      topPath += ` L ${toX(points[i].dist).toFixed(2)} ${toY(points[i].smoothEle).toFixed(2)}`;
    }
    polyPath += ` L ${toX(points[points.length - 1].dist).toFixed(2)} ${yBase.toFixed(2)} Z`;

    profileBodyMarkup = `
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          ${gradientStops}
        </linearGradient>
      </defs>
      <path d="${polyPath}" fill="url(#${gradId})" />
    `;
  }

  // 3. Distance Grid & Ticks
  let gridMarkup = '';
  if (settings.showDistanceTicks) {
    let stepKm = totalDistU > 100 ? 25 : (totalDistU > 50 ? 10 : (totalDistU > 20 ? 5 : 2));
    const stepMeters = stepKm / dFactor;
    const numTicks = Math.floor(stats.totalDist / stepMeters);

    for (let t = 1; t <= numTicks; t++) {
      const tickDist = t * stepMeters;
      const x = toX(tickDist).toFixed(2);
      gridMarkup += `
        <line x1="${x}" y1="${padTop.toFixed(2)}" x2="${x}" y2="${yBase.toFixed(2)}" stroke="${theme.grid}" stroke-width="0.25" stroke-dasharray="0.5,0.5"/>
        <text x="${x}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.95" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${t * stepKm}</text>
      `;
    }
    gridMarkup += `
      <text x="${padLeft.toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.95" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="start">0</text>
      <text x="${(padLeft + plotW).toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${distUnit}</text>
    `;
  }

  // 4. Min / Max Altitude Labels
  let eleMarkup = '';
  if (settings.showElevationLabels) {
    const minStr = `${Math.round(minEleU)}${eleUnit}`;
    const maxStr = `${Math.round(maxEleU)}${eleUnit}`;
    eleMarkup += `
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.maxEle) + 0.9).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${maxStr}</text>
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.minEle) + 0.6).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${minStr}</text>
    `;
  }

  // 5. Active Waypoints Pre-calculation for Joint Collision Avoidance
  const activeWaypoints = (waypoints || []).filter(w => w && w.enabled !== false && w.distM >= 0 && w.distM <= stats.totalDist);
  const customPositions = settings.customPositions || {};

  // 6. Climb Segment Overlays & Summit Badges (Two-Tone High-Contrast Roadbook Badges)
  let climbsMarkup = '';
  if (settings.showClimbs && climbs && climbs.length > 0) {
    const hiddenClimbIds = new Set((settings.hiddenClimbIds || []).map(id => String(id)));
    const visibleClimbs = climbs.filter(c => !hiddenClimbIds.has(String(c.id)) && c.enabled !== false);

    const minY = settings.showHeader ? 5.8 : 1.5;
    const maxY = H - padBottom - 1.0;
    const badgeLayout = computeClimbBadgeLayout(visibleClimbs, toX, toY, padLeft, padRight, minY, maxY, W, activeWaypoints, customPositions);

    climbs.forEach(climb => {
      const isHidden = hiddenClimbIds.has(String(climb.id)) || climb.enabled === false;
      const badge = isHidden ? null : badgeLayout.find(b => b.climb.id === climb.id);
      const startX = toX(climb.startKm * 1000);
      const summitX = toX(climb.summitKm * 1000);

      // Find profile points belonging to this climb for precise highlight polygon
      const climbPts = points.filter(p => p.dist >= climb.startKm * 1000 && p.dist <= climb.summitKm * 1000);
      let polyD = '';
      let lineD = '';
      if (climbPts.length >= 2) {
        polyD = `M ${startX.toFixed(2)} ${yBase.toFixed(2)}`;
        lineD = `M ${toX(climbPts[0].dist).toFixed(2)} ${toY(climbPts[0].smoothEle).toFixed(2)}`;
        climbPts.forEach(pt => {
          const px = toX(pt.dist).toFixed(2);
          const py = toY(pt.smoothEle).toFixed(2);
          polyD += ` L ${px} ${py}`;
          lineD += ` L ${px} ${py}`;
        });
        polyD += ` L ${summitX.toFixed(2)} ${yBase.toFixed(2)} Z`;
      } else {
        const startY = toY(getInterpolatedEle(points, climb.startKm * 1000));
        const summitY = toY(climb.summitEle);
        polyD = `M ${startX.toFixed(2)} ${yBase.toFixed(2)} L ${startX.toFixed(2)} ${startY.toFixed(2)} L ${summitX.toFixed(2)} ${summitY.toFixed(2)} L ${summitX.toFixed(2)} ${yBase.toFixed(2)} Z`;
        lineD = `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${summitX.toFixed(2)} ${summitY.toFixed(2)}`;
      }

      let badgeMarkup = '';
      if (badge) {
        const { x, y, w, h, catW, catCode, statsLength, statsGrade, fontSize, summitX, summitY } = badge;
        const anchor = calculateLeaderLineAnchor({ x, y, w, h }, { x: summitX, y: summitY });

        const leaderLine = `
          <line id="leader-climb-${climb.id}" class="climb-leader-line" x1="${anchor.connX.toFixed(2)}" y1="${anchor.connY.toFixed(2)}" x2="${summitX.toFixed(2)}" y2="${summitY.toFixed(2)}" stroke="${theme.badgeStroke}" stroke-width="0.32" stroke-dasharray="0.6,0.4" opacity="${anchor.isVisible ? '0.85' : '0'}"/>
        `;

        const catColor = getClimbCategoryColor(climb.category, theme);
        const actualCatW = catW || Math.max(4.5, w * 0.35);
        const statsW = w - actualCatW;
        const statsMidX = actualCatW + (statsW / 2);

        badgeMarkup = `
          <g class="climb-summit-group" data-climb-id="${climb.id}">
            ${leaderLine}
            <circle class="climb-peak-dot" cx="${summitX.toFixed(2)}" cy="${summitY.toFixed(2)}" r="1.1" fill="${catColor}" stroke="${theme.topStroke}" stroke-width="0.35"/>
            <g class="draggable-label climb-badge-drag" data-drag-type="climb" data-drag-id="climb-${climb.id}" data-summit-x="${summitX.toFixed(2)}" data-summit-y="${summitY.toFixed(2)}" data-w="${w.toFixed(2)}" data-h="${h.toFixed(2)}" transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})">
              <!-- Outer Badge Box -->
              <rect class="climb-badge-rect" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="0.7" fill="${theme.badgeBg}" stroke="${theme.badgeStroke}" stroke-width="0.35"/>
              <!-- Category Pill (Left Segment) -->
              <path class="climb-cat-pill" d="M 0.7 0 L ${actualCatW.toFixed(2)} 0 L ${actualCatW.toFixed(2)} ${h.toFixed(2)} L 0.7 ${h.toFixed(2)} A 0.7 0.7 0 0 1 0 ${(h - 0.7).toFixed(2)} L 0 0.7 A 0.7 0.7 0 0 1 0.7 0 Z" fill="${catColor}"/>
              <line x1="${actualCatW.toFixed(2)}" y1="0" x2="${actualCatW.toFixed(2)}" y2="${h.toFixed(2)}" stroke="${theme.badgeStroke}" stroke-width="0.3"/>
              <!-- Category Code Text -->
              <text class="climb-cat-text" x="${(actualCatW / 2).toFixed(2)}" y="${(h * 0.72).toFixed(2)}" fill="#ffffff" font-size="${fontSize}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${catCode || 'CLIMB'}</text>
              <!-- Length & High-Contrast Bold Percentage Text (Right Segment) -->
              <text class="climb-stats-text" x="${statsMidX.toFixed(2)}" y="${(h * 0.72).toFixed(2)}" fill="${theme.badgeText}" font-size="${fontSize}" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
                <tspan font-weight="600" fill="${theme.textMuted}">${statsLength || (climb.lengthKm.toFixed(1) + 'k')} </tspan>
                <tspan font-weight="900" fill="${theme.badgeText}">${statsGrade || (climb.avgGrade + '%')}</tspan>
              </text>
            </g>
          </g>
        `;
      }

      climbsMarkup += `
        <g class="climb-segment" data-climb-id="${climb.id}">
          <path class="climb-highlight-poly" d="${polyD}" fill="url(#climb-active-grad)" opacity="0" pointer-events="none"/>
          <path class="climb-highlight-stroke" d="${lineD}" fill="none" stroke="#2563eb" stroke-width="0.9" stroke-linecap="round" opacity="0" pointer-events="none"/>
          ${badgeMarkup}
        </g>
      `;
    });
  }

  // 7. Waypoints & Race Cues (Draggable & Coordinated)
  let waypointsMarkup = '';
  const showWaypoints = settings.showWaypoints !== false;
  const showWptLabels = settings.showWaypointLabels !== false;

  if (showWaypoints && activeWaypoints.length > 0) {
    const sortedWpts = [...activeWaypoints].sort((a, b) => a.distM - b.distM);

    sortedWpts.forEach((wpt, idx) => {
      const typeCfg = WAYPOINT_CONFIG[wpt.type] || WAYPOINT_CONFIG['feed'];
      const wptX = toX(wpt.distM);
      const profEle = getInterpolatedEle(points, wpt.distM);
      const profY = toY(profEle);

      const distVal = (wpt.distM * dFactor).toFixed(1);
      const distStr = `${distVal}${settings.units !== 'imperial' ? 'k' : 'm'}`;
      const customLabel = (wpt.label || '').trim();

      // Staggering: check proximity to adjacent waypoints or climb summits (Delta X < 10.5mm)
      let isStaggered = false;
      if (idx > 0) {
        const prevWptX = toX(sortedWpts[idx - 1].distM);
        if (Math.abs(wptX - prevWptX) < 10.5) {
          isStaggered = (idx % 2 === 1);
        }
      }
      if (!isStaggered && climbs && climbs.length > 0) {
        for (const c of climbs) {
          const sX = toX(c.summitKm * 1000);
          if (Math.abs(wptX - sX) < 10.5) {
            isStaggered = true;
            break;
          }
        }
      }

      const badgeR = 2.0; // 4.0mm diameter pin
      let badgeX = wptX;
      let badgeY = isStaggered ? Math.max(padTop - 2.0, profY - 13.5) : Math.max(padTop - 3.6, profY - 7.5);

      // Check if custom dragged position exists for this waypoint
      if (customPositions && customPositions['wpt-' + wpt.id]) {
        badgeX = customPositions['wpt-' + wpt.id].x;
        badgeY = customPositions['wpt-' + wpt.id].y;
      }

      if (badgeY < 2.5) badgeY = 2.5;
      if (badgeY > H - 6.0) badgeY = H - 6.0;

      // Drop Line / Leader line from pin badge down to profile surface
      const dropLine = `
        <line id="leader-wpt-${escapeXml(wpt.id)}" class="wpt-leader-line" x1="${badgeX.toFixed(2)}" y1="${(badgeY + badgeR).toFixed(2)}" x2="${wptX.toFixed(2)}" y2="${profY.toFixed(2)}" stroke="${typeCfg.color}" stroke-width="0.4" stroke-dasharray="0.6,0.4" opacity="0.95"/>
        <circle cx="${wptX.toFixed(2)}" cy="${profY.toFixed(2)}" r="0.8" fill="${typeCfg.color}" stroke="${theme.bg}" stroke-width="0.3"/>
      `;

      // Icon Pin
      const glyph = renderWaypointGlyph(wpt.type, typeCfg.textColor);

      // High contrast label
      let textMarkup = '';
      if (showWptLabels) {
        const tagText = customLabel ? `${distStr} ${customLabel}` : `${distStr} ${typeCfg.shortCode}`;
        const tagW = Math.min(26, tagText.length * 1.35 + 2.5);
        const tagX = - (tagW / 2);
        let tagY = badgeR + 0.6;
        if (badgeY + badgeR + 3.2 > profY && badgeY - 3.2 >= 1.0) {
          tagY = - badgeR - 2.8;
        }

        textMarkup = `
          <g transform="translate(${tagX.toFixed(2)}, ${tagY.toFixed(2)})">
            <rect width="${tagW.toFixed(2)}" height="2.6" rx="0.5" fill="${theme.badgeBg}" stroke="${theme.badgeStroke}" stroke-width="0.3"/>
            <text x="${(tagW / 2).toFixed(2)}" y="1.85" fill="${theme.badgeText}" font-size="1.5" font-weight="800" font-family="monospace, sans-serif" text-anchor="middle">${tagText}</text>
          </g>
        `;
      }

      const pinMarkup = `
        <g class="draggable-label wpt-badge-drag" data-drag-type="wpt" data-drag-id="wpt-${escapeXml(wpt.id)}" data-apex-x="${wptX.toFixed(2)}" data-apex-y="${profY.toFixed(2)}" transform="translate(${badgeX.toFixed(2)}, ${badgeY.toFixed(2)})">
          <circle cx="0" cy="0" r="${badgeR}" fill="${typeCfg.color}" stroke="${theme.topStroke}" stroke-width="0.35"/>
          ${glyph}
          ${textMarkup}
        </g>
      `;

      waypointsMarkup += `
        <g class="wpt-marker" data-wpt-id="${escapeXml(wpt.id)}">
          ${dropLine}
          ${pinMarkup}
        </g>
      `;
    });
  }

  // 8. Stats Header
  let headerMarkup = '';
  if (settings.showHeader) {
    const title = escapeXml(settings.title || 'StemProfile');
    const distStr = `${totalDistU.toFixed(1)} ${distUnit}`;
    const gainStr = `+${Math.round(elevGainU)} ${eleUnit}`;
    const maxGStr = `Max ${stats.maxGrade.toFixed(1)}%`;

    headerMarkup += `
      <text x="${padLeft.toFixed(2)}" y="4.2" fill="${theme.text}" font-size="2.8" font-weight="800" font-family="sans-serif">${title}</text>
      <text x="${(W - padRight).toFixed(2)}" y="4.2" fill="${theme.text}" font-size="2.2" font-weight="700" font-family="monospace" text-anchor="end">
        <tspan fill="${theme.text}">${distStr}</tspan>  <tspan fill="${theme.z1}" font-weight="800">${gainStr}</tspan>  <tspan fill="${theme.z4}" font-weight="800">${maxGStr}</tspan>
      </text>
      <line x1="${padLeft.toFixed(2)}" y1="5.2" x2="${(W - padRight).toFixed(2)}" y2="5.2" stroke="${theme.grid}" stroke-width="0.3"/>
    `;
  }

  // 9. Cut Guidelines
  let cutMarkup = '';
  if (settings.showCutGuidelines) {
    cutMarkup = `<rect x="0.2" y="0.2" width="${(W - 0.4).toFixed(2)}" height="${(H - 0.4).toFixed(2)}" rx="${radius}" fill="none" stroke="${theme.cutLine}" stroke-width="0.3" stroke-dasharray="1,1"/>`;
  }

  return `
    <svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <defs>
        <linearGradient id="climb-active-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0.08"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      ${gridMarkup}
      ${profileBodyMarkup}
      <path d="${topPath}" fill="none" stroke="${theme.topStroke}" stroke-width="0.75" stroke-linejoin="round" stroke-linecap="round"/>
      ${eleMarkup}
      ${climbsMarkup}
      ${waypointsMarkup}
      ${headerMarkup}
      ${cutMarkup}
    </svg>
  `.trim();
}
