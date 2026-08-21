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
 * @type {Record<'white'|'dark', RenderTheme>}
 */
export const THEMES = {
  'white': {
    name: 'Print White',
    bg: '#ffffff',
    text: '#0f172a',          // Crisp deep slate/black
    textMuted: '#334155',     // High-contrast slate 700
    grid: 'rgba(15, 23, 42, 0.15)',
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
  'dark': {
    name: 'Dark Cockpit',
    bg: '#0d1117',
    text: '#f8fafc',          // Pure bright text
    textMuted: '#94a3b8',     // Slate 400
    grid: 'rgba(255, 255, 255, 0.12)',
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
  }
};

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
 * @typedef {Object} ClimbBadgePlacement
 * @property {number} x - Top-left X coordinate in millimeters
 * @property {number} y - Top-left Y coordinate in millimeters
 * @property {number} w - Badge bounding box width in millimeters
 * @property {number} h - Badge bounding box height in millimeters
 * @property {string} label - Formatted category & slope label text
 * @property {number} fontSize - Font size in millimeters
 * @property {number} summitX - Peak summit pin X coordinate in millimeters
 * @property {number} summitY - Peak summit pin Y coordinate in millimeters
 * @property {import('./signal.js').DetectedClimb} climb - Source climb metadata
 */

/**
 * /**
 * Multi-tier anti-collision layout engine for Climb Summit Badges and Waypoints.
 *
 * Implements an alternating two-tier baseline offset:
 * - Tier 1 (Base):    y1 = summitY - badgeH - 3.2mm  (~12px above apex)
 * - Tier 2 (Elevated): y2 = summitY - badgeH - 7.4mm  (~28px above apex)
 *
 * Automatically triggers alternating tier shifts for markers in close horizontal
 * proximity (Delta X < 10.5mm / ~40px) and generates dynamic SVG leader lines
 * to the exact apex coordinates on the elevation curve.
 *
 * @param {import('./signal.js').DetectedClimb[]} climbs - Array of detected route climbs
 * @param {function(number): number} toX - Function mapping distance in meters to X mm
 * @param {function(number): number} toY - Function mapping elevation in meters to Y mm
 * @param {number} padLeft - Left plotting boundary padding in mm
 * @param {number} padRight - Right plotting boundary padding in mm
 * @param {number} minY - Topmost allowed Y coordinate for badges in mm
 * @param {number} maxY - Bottommost allowed Y coordinate for badges in mm
 * @param {number} W - Total sticker width in mm
 * @param {Array<Object>} [waypoints=[]] - Active waypoints for joint collision avoidance
 * @returns {ClimbBadgePlacement[]} Array of non-overlapping badge placement objects
 */
export function computeClimbBadgeLayout(climbs, toX, toY, padLeft, padRight, minY, maxY, W, waypoints = []) {
  if (!climbs || climbs.length === 0) return [];

  const sortedClimbs = [...climbs].sort((a, b) => a.summitKm - b.summitKm);
  const placedBadges = [];
  const isDense = sortedClimbs.length >= 4;

  sortedClimbs.forEach((climb, climbIdx) => {
    const summitX = toX(climb.summitKm * 1000);
    const summitY = toY(climb.summitEle);

    const label = isDense
      ? `${climb.category} · ${climb.lengthKm.toFixed(1)}k ${climb.avgGrade}%`
      : `${climb.category} • ${climb.lengthKm.toFixed(1)}k @ ${climb.avgGrade}%`;

    const fontSize = isDense ? 1.45 : 1.6;
    const badgeH = isDense ? 2.8 : 3.0;
    const charWidth = isDense ? 1.05 : 1.15;
    const badgeW = Math.min(25, label.length * charWidth + 2.4);

    const naturalX = summitX - (badgeW / 2);
    const clampedNaturalX = Math.max(padLeft, Math.min(W - padRight - badgeW, naturalX));

    // Check if near previous climb (Delta X < 10.5mm / ~40px)
    let isConsecutiveNear = false;
    if (climbIdx > 0) {
      const prevSummitX = toX(sortedClimbs[climbIdx - 1].summitKm * 1000);
      if (Math.abs(summitX - prevSummitX) < 10.5) {
        isConsecutiveNear = true;
      }
    }

    // Alternating Two-Tier Offsets: y1 = summit - 12px (3.2mm), y2 = summit - 28px (7.4mm)
    const tier1Y = Math.max(minY, summitY - badgeH - 3.2);
    const tier2Y = Math.max(minY, summitY - badgeH - 7.4);

    // Primary candidates
    const candidateTiersY = isConsecutiveNear && (climbIdx % 2 === 1)
      ? [
          tier2Y,                                       // Tier 2: Elevated offset for alternating proximity
          tier1Y,                                       // Tier 1: Base offset
          minY + 0.3,                                   // Tier 3: Top shelf
          minY + badgeH + 0.7,                          // Tier 4: Top shelf tier 2
          Math.max(minY, summitY - badgeH - 11.5),      // Tier 5: High
          Math.min(maxY - badgeH, summitY + 2.0)        // Tier 6: Shoulder
        ]
      : [
          tier1Y,                                       // Tier 1: Base offset
          tier2Y,                                       // Tier 2: Elevated offset
          minY + 0.3,                                   // Tier 3: Top shelf
          minY + badgeH + 0.7,                          // Tier 4: Top shelf tier 2
          Math.max(minY, summitY - badgeH - 11.5),      // Tier 5: High
          Math.min(maxY - badgeH, summitY + 2.0)        // Tier 6: Shoulder
        ];

    // Horizontal nudge offsets
    const candidateDxs = [0, -3.5, 3.5, -7.0, 7.0, -11.0, 11.0, -16.0, 16.0, -22.0, 22.0];

    let bestCandidate = null;
    let minCost = Infinity;

    for (let t = 0; t < candidateTiersY.length; t++) {
      const candY = candidateTiersY[t];
      if (candY < minY || candY + badgeH > maxY) continue;

      for (let d = 0; d < candidateDxs.length; d++) {
        const dx = candidateDxs[d];
        const candX = Math.max(padLeft, Math.min(W - padRight - badgeW, clampedNaturalX + dx));

        // Check collision against already placed badges
        let collides = false;
        const marginX = 0.8;
        const marginY = 0.5;

        for (const pb of placedBadges) {
          const overlapX = (candX < pb.x + pb.w + marginX) && (candX + badgeW + marginX > pb.x);
          const overlapY = (candY < pb.y + pb.h + marginY) && (candY + badgeH + marginY > pb.y);
          if (overlapX && overlapY) {
            collides = true;
            break;
          }
        }

        const distFromSummit = Math.hypot((candX + badgeW / 2) - summitX, (candY + badgeH) - summitY);
        const cost = (collides ? 10000 : 0) + distFromSummit + (t * 2.2) + (Math.abs(dx) * 1.5);

        if (cost < minCost) {
          minCost = cost;
          bestCandidate = { x: candX, y: candY, w: badgeW, h: badgeH, label, fontSize, summitX, summitY, climb };
          if (!collides && d === 0 && t === 0) {
            break;
          }
        }
      }
      if (bestCandidate && minCost < 10000 && t === 0) {
        break;
      }
    }

    if (!bestCandidate) {
      bestCandidate = {
        x: clampedNaturalX,
        y: tier1Y,
        w: badgeW,
        h: badgeH,
        label,
        fontSize,
        summitX,
        summitY,
        climb
      };
    }

    placedBadges.push(bestCandidate);
  });

  return placedBadges;
}

/**
 * Main vector SVG rendering pipeline for elevation stickers.
 *
 * Generates an SVG document sized precisely to millimeter physical dimensions (`W` mm x `H` mm).
 * Constructs:
 * 1. Background rectangle with configurable corner radius
 * 2. Segmented block columns or smooth linear gradient path
 * 3. Distance grid ticks and kilometer markers
 * 4. Min/max altitude telemetry labels
 * 5. Interactive climb highlight regions & multi-tier summit badges with leader lines
 * 6. High-glanceability nutrition and race waypoints
 * 7. Title header and summary stats
 * 8. Millimeter dashed scissor cutting guides
 *
 * @param {import('./signal.js').ProfilePoint[]} points - Filtered route points
 * @param {import('./signal.js').RouteStats} stats - Telemetry metrics (gain, distance, max grade)
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected categorized climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized spatial blocks
 * @param {Array<Object>} [waypoints=[]] - Active race waypoints
 * @param {Object} [settings={}] - User configuration settings
 * @param {boolean} [isPrint=false] - When true, forces print-optimized white theme
 * @returns {string} Pure vector SVG XML markup
 */
export function renderProfileSVG(points, stats, climbs = [], blocks = [], waypoints = [], settings = {}, isPrint = false) {
  // Support polymorphic parameter calls: (points, stats, climbs, blocks, settings, isPrint)
  if (!Array.isArray(waypoints) && typeof waypoints === 'object') {
    isPrint = settings === true;
    settings = waypoints;
    waypoints = settings.waypoints || [];
  }

  const W = settings.widthMm || 110;
  const H = settings.heightMm || 35;
  const radius = settings.radiusMm || 0;
  const themeKey = isPrint ? 'white' : (settings.theme === 'dark' ? 'dark' : 'white');
  const theme = THEMES[themeKey] || THEMES['white'];

  if (!points || points.length < 2 || !stats) {
    return `<svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      <text x="50%" y="50%" fill="${theme.textMuted}" text-anchor="middle" font-size="3" font-weight="700" font-family="sans-serif">Drop GPX to render profile</text>
    </svg>`;
  }

  const isMetric = settings.units !== 'imperial';
  const dFactor = isMetric ? 1 / 1000 : 1 / 1609.344;
  const eFactor = isMetric ? 1 : 3.28084;
  const distUnit = isMetric ? 'km' : 'mi';
  const eleUnit = isMetric ? 'm' : 'ft';

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
  const minElePadded = Math.max(0, stats.minEle - (eleHeadroom * 0.5));
  const maxElePadded = stats.maxEle + eleHeadroom;
  const spanEle = maxElePadded - minElePadded;

  const toX = d => padLeft + ((d / stats.totalDist) * plotW);
  const toY = e => padTop + plotH - (((e - minElePadded) / spanEle) * plotH);

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

    // Stride calculation for very narrow blocks on long stages so text never overlaps
    const avgBlockWidthMm = plotW / Math.max(1, blocks.length);
    const stride = avgBlockWidthMm < 1.2 ? Math.max(1, Math.ceil(1.6 / avgBlockWidthMm)) : 1;

    blocks.forEach((b, idx) => {
      const x1 = toX(b.startDist);
      const x2 = toX(b.endDist);
      const y1 = toY(b.startEle);
      const y2 = toY(b.endEle);
      const blockWidthMm = x2 - x1;

      topPath += ` L ${x2.toFixed(2)} ${y2.toFixed(2)}`;

      // Block Trapezoid
      blocksPolygons += `
        <polygon points="${x1.toFixed(2)},${yBase.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x2.toFixed(2)},${yBase.toFixed(2)}" fill="${zoneColors[b.zone]}" stroke="${theme.blockStroke}" stroke-width="0.2"/>
      `;

      // Vertical Block Divider Line
      if (idx > 0) {
        blockDividers += `
          <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${yBase.toFixed(2)}" stroke="${theme.divider}" stroke-width="0.35"/>
        `;
      }

      // Block Percentage Text (Always visible for 2.5km, 1.0km, 500m, Custom)
      if (settings.showBlockPct !== false) {
        const topMidY = (y1 + y2) / 2;
        const colHeight = yBase - topMidY;
        const midX = (x1 + x2) / 2;
        const gradeVal = Math.round(b.absGrade);
        const gradeText = `${gradeVal}%`;

        const shouldRender = (stride === 1) || (idx % stride === 0) || (b.absGrade >= 4.0);

        if (shouldRender && colHeight >= 2.5) {
          if (blockWidthMm >= 3.0) {
            // Wide block: Horizontal text with outline halo
            const textY = Math.min(yBase - 1.2, topMidY + (colHeight * 0.45));
            blockTextLabels += `
              <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" fill="#ffffff" stroke="rgba(0,0,0,0.85)" stroke-width="0.36" stroke-linejoin="round" paint-order="stroke fill" font-size="1.7" font-weight="900" font-family="monospace, sans-serif" text-anchor="middle">${gradeText}</text>
            `;
          } else if (blockWidthMm >= 1.7) {
            // Medium block: Compact horizontal or vertical text depending on height
            if (colHeight >= 6.0) {
              const textY = (topMidY + yBase) / 2;
              blockTextLabels += `
                <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" transform="rotate(-90, ${midX.toFixed(2)}, ${textY.toFixed(2)})" fill="#ffffff" stroke="rgba(0,0,0,0.85)" stroke-width="0.32" stroke-linejoin="round" paint-order="stroke fill" font-size="1.45" font-weight="900" font-family="monospace, sans-serif" text-anchor="middle">${gradeText}</text>
              `;
            } else {
              const textY = Math.min(yBase - 1.0, topMidY + (colHeight * 0.48));
              blockTextLabels += `
                <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" fill="#ffffff" stroke="rgba(0,0,0,0.85)" stroke-width="0.32" stroke-linejoin="round" paint-order="stroke fill" font-size="1.35" font-weight="900" font-family="monospace, sans-serif" text-anchor="middle">${gradeText}</text>
              `;
            }
          } else if (blockWidthMm >= 0.75) {
            // Narrow block (e.g. 500m on long stages): Vertical text like Grand Tour roadbooks
            if (colHeight >= 4.5) {
              const textY = (topMidY + yBase) / 2;
              blockTextLabels += `
                <text x="${midX.toFixed(2)}" y="${textY.toFixed(2)}" transform="rotate(-90, ${midX.toFixed(2)}, ${textY.toFixed(2)})" fill="#ffffff" stroke="rgba(0,0,0,0.85)" stroke-width="0.30" stroke-linejoin="round" paint-order="stroke fill" font-size="1.3" font-weight="900" font-family="monospace, sans-serif" text-anchor="middle">${gradeText}</text>
              `;
            }
          }
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
        <text x="${x}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.9" font-weight="700" font-family="monospace" text-anchor="middle">${t * stepKm}</text>
      `;
    }
    gridMarkup += `
      <text x="${padLeft.toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.9" font-weight="700" font-family="monospace" text-anchor="start">0</text>
      <text x="${(padLeft + plotW).toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="800" font-family="sans-serif" text-anchor="end">${distUnit}</text>
    `;
  }

  // 4. Min / Max Altitude Labels
  let eleMarkup = '';
  if (settings.showElevationLabels) {
    const minStr = `${Math.round(minEleU)}${eleUnit}`;
    const maxStr = `${Math.round(maxEleU)}${eleUnit}`;
    eleMarkup += `
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.maxEle) + 0.9).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="700" font-family="sans-serif" text-anchor="end">${maxStr}</text>
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.minEle) + 0.6).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="700" font-family="sans-serif" text-anchor="end">${minStr}</text>
    `;
  }

  // 5. Active Waypoints Pre-calculation for Joint Collision Avoidance
  const activeWaypoints = (waypoints || []).filter(w => w && w.enabled !== false && w.distM >= 0 && w.distM <= stats.totalDist);

  // 6. Climb Segment Overlays & Summit Badges (Interactive Cross-Highlighting & Anti-Collision)
  let climbsMarkup = '';
  if (settings.showClimbs && climbs && climbs.length > 0) {
    const minY = settings.showHeader ? 5.8 : 1.5;
    const maxY = H - padBottom - 1.0;
    const badgeLayout = computeClimbBadgeLayout(climbs, toX, toY, padLeft, padRight, minY, maxY, W, activeWaypoints);

    climbs.forEach(climb => {
      const badge = badgeLayout.find(b => b.climb.id === climb.id);
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
        const { x, y, w, h, label, fontSize, summitX, summitY } = badge;
        const badgeCenterX = x + (w / 2);
        const badgeBottomY = y + h;
        const badgeTopY = y;

        let connX = badgeCenterX;
        let connY = badgeBottomY;
        if (badgeBottomY <= summitY - 0.6) {
          connX = badgeCenterX;
          connY = badgeBottomY;
        } else if (badgeTopY >= summitY + 0.6) {
          connX = badgeCenterX;
          connY = badgeTopY;
        } else if (badgeCenterX <= summitX) {
          connX = x + w;
          connY = y + (h / 2);
        } else {
          connX = x;
          connY = y + (h / 2);
        }

        const distToSummit = Math.hypot(connX - summitX, connY - summitY);
        let leaderLine = '';
        if (distToSummit > 1.8) {
          leaderLine = `
            <line x1="${connX.toFixed(2)}" y1="${connY.toFixed(2)}" x2="${summitX.toFixed(2)}" y2="${summitY.toFixed(2)}" stroke="${theme.badgeStroke}" stroke-width="0.32" stroke-dasharray="0.6,0.4" opacity="0.85"/>
          `;
        }

        badgeMarkup = `
          <g class="climb-summit-group" data-climb-id="${climb.id}">
            ${leaderLine}
            <circle class="climb-peak-dot" cx="${summitX.toFixed(2)}" cy="${summitY.toFixed(2)}" r="1.1" fill="${theme.z4}" stroke="${theme.topStroke}" stroke-width="0.35"/>
            <g transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})">
              <rect class="climb-badge-rect" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="0.6" fill="${theme.badgeBg}" stroke="${theme.badgeStroke}" stroke-width="0.35"/>
              <text class="climb-badge-text" x="${(w / 2).toFixed(2)}" y="${(h * 0.70).toFixed(2)}" fill="${theme.badgeText}" font-size="${fontSize}" font-weight="800" font-family="sans-serif" text-anchor="middle">${label}</text>
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

  // 7. Waypoints & Race Cues
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
      const distStr = `${distVal}${isMetric ? 'k' : 'm'}`;
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
      let badgeY = isStaggered ? Math.max(padTop - 2.0, profY - 13.5) : Math.max(padTop - 3.6, profY - 7.5);
      if (badgeY < 2.5) badgeY = 2.5;
      if (badgeY > H - 6.0) badgeY = H - 6.0;

      // Drop Line from pin badge down to profile surface
      const dropLine = `
        <line x1="${wptX.toFixed(2)}" y1="${(badgeY + badgeR).toFixed(2)}" x2="${wptX.toFixed(2)}" y2="${profY.toFixed(2)}" stroke="${typeCfg.color}" stroke-width="0.4" stroke-dasharray="0.6,0.4" opacity="0.95"/>
        <circle cx="${wptX.toFixed(2)}" cy="${profY.toFixed(2)}" r="0.8" fill="${typeCfg.color}" stroke="${theme.bg}" stroke-width="0.3"/>
      `;

      // Icon Pin
      const glyph = renderWaypointGlyph(wpt.type, typeCfg.textColor);
      const pinMarkup = `
        <g transform="translate(${wptX.toFixed(2)}, ${badgeY.toFixed(2)})">
          <circle cx="0" cy="0" r="${badgeR}" fill="${typeCfg.color}" stroke="${theme.topStroke}" stroke-width="0.35"/>
          ${glyph}
        </g>
      `;

      // High contrast label
      let textMarkup = '';
      if (showWptLabels) {
        const tagText = customLabel ? `${distStr} ${customLabel}` : `${distStr} ${typeCfg.shortCode}`;
        const tagW = Math.min(26, tagText.length * 1.35 + 2.5);
        const tagX = Math.max(padLeft, Math.min(W - padRight - tagW, wptX - (tagW / 2)));
        let tagY = badgeY + badgeR + 0.6;
        if (tagY + 2.6 > profY && badgeY - 3.2 >= 1.0) {
          tagY = badgeY - badgeR - 2.8;
        }

        textMarkup = `
          <g transform="translate(${tagX.toFixed(2)}, ${tagY.toFixed(2)})">
            <rect width="${tagW.toFixed(2)}" height="2.6" rx="0.5" fill="${theme.badgeBg}" stroke="${theme.badgeStroke}" stroke-width="0.3"/>
            <text x="${(tagW / 2).toFixed(2)}" y="1.85" fill="${theme.badgeText}" font-size="1.5" font-weight="800" font-family="monospace, sans-serif" text-anchor="middle">${tagText}</text>
          </g>
        `;
      }

      waypointsMarkup += `
        <g class="wpt-marker" data-wpt-id="${escapeXml(wpt.id)}">
          ${dropLine}
          ${pinMarkup}
          ${textMarkup}
        </g>
      `;
    });
  }

  // 7. Stats Header
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

  // 8. Cut Guidelines
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
