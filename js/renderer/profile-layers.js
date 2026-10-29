/**
 * Elevation profile SVG layers. Each function renders one visual layer of the
 * sticker from a shared geometry context built by renderProfileSVG().
 *
 * @module renderer/profile-layers
 */

import { THEMES, getClimbCategoryColor } from './themes.js';
import { WAYPOINT_CONFIG, renderWaypointGlyph } from './waypoints-config.js';
import { calculateLeaderLineAnchor, computeBlockPctLayout, computeClimbBadgeLayout } from '../layout.js';
import { escapeXml } from '../escape.js';
import { getInterpolatedEle } from '../signal.js';
import { getUnitFactors, getUnitLabels } from '../units.js';

/**
 * @typedef {Object} ProfileContext
 * @property {Array<Object>} points - Profile points
 * @property {Object} stats - Route stats
 * @property {Array<Object>} climbs - Detected climbs
 * @property {Array<Object>} blocks - Spatial blocks (empty in smooth mode)
 * @property {Array<Object>} activeWaypoints - Enabled waypoints within the route
 * @property {Object} settings - Sticker settings
 * @property {Object} theme - Resolved theme palette
 * @property {string} themeKey - Resolved theme name
 * @property {number} W - Sticker width (mm)
 * @property {number} H - Sticker height (mm)
 * @property {number} radius - Corner radius (mm)
 * @property {number} padLeft
 * @property {number} padRight
 * @property {number} padTop
 * @property {number} padBottom
 * @property {number} plotW
 * @property {number} yBase - Y of the profile baseline
 * @property {function(number): number} toX - Route distance (m) to SVG x
 * @property {function(number): number} toY - Elevation (m) to SVG y
 * @property {string[]} zoneColors - Gradient zone colors z1..z4
 * @property {number} dFactor - Meters to display distance unit
 * @property {number} eFactor - Meters to display elevation unit
 * @property {string} distUnit
 * @property {string} eleUnit
 * @property {Record<string, {x: number, y: number}>} customPositions - Dragged label positions
 */

/**
 * Builds the shared geometry context for a profile render.
 *
 * @returns {ProfileContext}
 */
export function createProfileContext(points, stats, climbs, blocks, waypoints, settings, isPrint) {
  const W = settings.widthMm || 110;
  const H = settings.heightMm || 35;
  const radius = settings.radiusMm || 0;
  const themeKey = isPrint ? 'white' : (THEMES[settings.theme] ? settings.theme : (settings.theme === 'dark' ? 'dark' : 'white'));
  const theme = THEMES[themeKey] || THEMES['white'];

  const ctx = { points, stats, climbs, blocks, settings, theme, themeKey, W, H, radius };
  if (!points || points.length < 2 || !stats) return ctx;

  const { dFactor, eFactor } = getUnitFactors(settings.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(settings.units);

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

  // Active Waypoints Pre-calculation for Joint Collision Avoidance
  const activeWaypoints = (waypoints || []).filter(w => w && w.enabled !== false && w.distM >= 0 && w.distM <= stats.totalDist);

  return Object.assign(ctx, {
    activeWaypoints,
    padLeft, padRight, padTop, padBottom, plotW, yBase, toX, toY,
    zoneColors: [theme.z1, theme.z2, theme.z3, theme.z4],
    dFactor, eFactor, distUnit, eleUnit,
    customPositions: settings.customPositions || {}
  });
}

/**
 * Segmented block columns (2.5km / 1.0km / 500m / Custom) with in-block gradient %.
 *
 * @param {ProfileContext} ctx
 * @returns {{ body: string, topPath: string }}
 */
export function renderBlockColumns(ctx) {
  const { blocks, settings, theme, themeKey, W, H, plotW, yBase, toX, toY, zoneColors } = ctx;
  let blocksPolygons = '';
  let blockDividers = '';
  let blockTextLabels = '';

  let topPath = `M ${toX(blocks[0].startDist).toFixed(2)} ${toY(blocks[0].startEle).toFixed(2)}`;

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

  return { body: blocksPolygons + blockDividers + blockTextLabels, topPath };
}

/**
 * Smooth continuous gradient path (continuous mode, no blocks).
 *
 * @param {ProfileContext} ctx
 * @returns {{ body: string, topPath: string }}
 */
export function renderSmoothProfile(ctx) {
  const { points, stats, yBase, toX, toY, zoneColors } = ctx;
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
  let topPath = `M ${toX(points[0].dist).toFixed(2)} ${toY(points[0].smoothEle).toFixed(2)}`;

  for (let i = 1; i < points.length; i++) {
    polyPath += ` L ${toX(points[i].dist).toFixed(2)} ${toY(points[i].smoothEle).toFixed(2)}`;
    topPath += ` L ${toX(points[i].dist).toFixed(2)} ${toY(points[i].smoothEle).toFixed(2)}`;
  }
  polyPath += ` L ${toX(points[points.length - 1].dist).toFixed(2)} ${yBase.toFixed(2)} Z`;

  const body = `
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
          ${gradientStops}
        </linearGradient>
      </defs>
      <path d="${polyPath}" fill="url(#${gradId})" />
    `;
  return { body, topPath };
}

/**
 * Distance grid lines and tick labels.
 *
 * @param {ProfileContext} ctx
 * @returns {string}
 */
export function renderDistanceTicks(ctx) {
  const { settings, stats, theme, padLeft, padTop, plotW, yBase, toX, dFactor } = ctx;
  let gridMarkup = '';
  if (!settings.showDistanceTicks) return gridMarkup;

  const totalDistU = stats.totalDist * dFactor;
  let stepKm = totalDistU > 100 ? 25 : (totalDistU > 50 ? 10 : (totalDistU > 20 ? 5 : 2));
  const stepMeters = stepKm / dFactor;
  const numTicks = Math.floor(stats.totalDist / stepMeters);
  const endX = padLeft + plotW;
  const lastTickX = numTicks > 0 ? toX(numTicks * stepMeters) : 0;
  const distToEnd = endX - lastTickX;

  for (let t = 1; t <= numTicks; t++) {
    const tickDist = t * stepMeters;
    const x = toX(tickDist);
    const isLastTick = (t === numTicks);

    let tickXStr = x.toFixed(2);
    let textAnchor = 'middle';

    // If the last tick is extremely close to the right edge (within 2.5mm), anchor it to end
    if (isLastTick && distToEnd < 2.5) {
      tickXStr = endX.toFixed(2);
      textAnchor = 'end';
    }

    gridMarkup += `
        <line x1="${x.toFixed(2)}" y1="${padTop.toFixed(2)}" x2="${x.toFixed(2)}" y2="${yBase.toFixed(2)}" stroke="${theme.grid}" stroke-width="0.25" stroke-dasharray="0.5,0.5"/>
        <text x="${tickXStr}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.95" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="${textAnchor}">${t * stepKm}</text>
      `;
  }
  gridMarkup += `
      <text x="${padLeft.toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.95" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="start">0</text>
    `;
  return gridMarkup;
}

/**
 * Min / max altitude labels.
 *
 * @param {ProfileContext} ctx
 * @returns {string}
 */
export function renderElevationLabels(ctx) {
  const { settings, stats, theme, padLeft, toY, eFactor, eleUnit } = ctx;
  if (!settings.showElevationLabels) return '';
  const minStr = `${Math.round(stats.minEle * eFactor)}${eleUnit}`;
  const maxStr = `${Math.round(stats.maxEle * eFactor)}${eleUnit}`;
  return `
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.maxEle) + 0.9).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${maxStr}</text>
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.minEle) + 0.6).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${minStr}</text>
    `;
}

/**
 * Climb highlight overlays and two-tone summit badges with leader lines.
 *
 * @param {ProfileContext} ctx
 * @returns {string}
 */
export function renderClimbs(ctx) {
  const { points, climbs, settings, theme, W, H, padLeft, padRight, padBottom, yBase, toX, toY, activeWaypoints, customPositions } = ctx;
  let climbsMarkup = '';
  if (!settings.showClimbs || !climbs || climbs.length === 0) return climbsMarkup;

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

    const badgeMarkup = badge ? renderClimbBadge(climb, badge, theme) : '';

    climbsMarkup += `
        <g class="climb-segment" data-climb-id="${climb.id}">
          <path class="climb-highlight-poly" d="${polyD}" fill="url(#climb-active-grad)" opacity="0" pointer-events="none"/>
          <path class="climb-highlight-stroke" d="${lineD}" fill="none" stroke="#2563eb" stroke-width="0.9" stroke-linecap="round" opacity="0" pointer-events="none"/>
          ${badgeMarkup}
        </g>
      `;
  });
  return climbsMarkup;
}

/**
 * Single draggable climb summit badge (category pill + length/grade) with its leader line.
 *
 * @param {Object} climb - Detected climb
 * @param {Object} badge - Layout result from computeClimbBadgeLayout
 * @param {Object} theme - Theme palette
 * @returns {string}
 */
function renderClimbBadge(climb, badge, theme) {
  const { x, y, w, h, catW, catCode, statsLength, statsGrade, fontSize, summitX, summitY } = badge;
  const anchor = calculateLeaderLineAnchor({ x, y, w, h }, { x: summitX, y: summitY });

  const leaderLine = `
          <line id="leader-climb-${climb.id}" class="climb-leader-line" x1="${anchor.connX.toFixed(2)}" y1="${anchor.connY.toFixed(2)}" x2="${summitX.toFixed(2)}" y2="${summitY.toFixed(2)}" stroke="${theme.badgeStroke}" stroke-width="0.32" stroke-dasharray="0.6,0.4" opacity="${anchor.isVisible ? '0.85' : '0'}"/>
        `;

  const catColor = getClimbCategoryColor(climb.category, theme);
  const actualCatW = catW || Math.max(8.0, w * 0.38);
  const statsW = w - actualCatW;
  const statsMidX = actualCatW + (statsW / 2);

  return `
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

/**
 * Waypoint pins, drop lines and labels (draggable, staggered near neighbours and summits).
 *
 * @param {ProfileContext} ctx
 * @returns {string}
 */
export function renderWaypoints(ctx) {
  const { points, climbs, settings, theme, H, padTop, toX, toY, dFactor, activeWaypoints, customPositions } = ctx;
  let waypointsMarkup = '';
  const showWaypoints = settings.showWaypoints !== false;
  const showWptLabels = settings.showWaypointLabels !== false;
  if (!showWaypoints || activeWaypoints.length === 0) return waypointsMarkup;

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
            <text x="${(tagW / 2).toFixed(2)}" y="1.85" fill="${theme.badgeText}" font-size="1.5" font-weight="800" font-family="monospace, sans-serif" text-anchor="middle">${escapeXml(tagText)}</text>
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
  return waypointsMarkup;
}

/**
 * Header strip: route title, distance, elevation gain and max gradient.
 *
 * @param {ProfileContext} ctx
 * @returns {string}
 */
export function renderHeader(ctx) {
  const { settings, stats, theme, W, padLeft, padRight, dFactor, eFactor, distUnit, eleUnit } = ctx;
  if (!settings.showHeader) return '';
  const title = escapeXml(settings.title || 'StemProfile');
  const distStr = `${(stats.totalDist * dFactor).toFixed(1)} ${distUnit}`;
  const gainStr = `+${Math.round(stats.elevGain * eFactor)} ${eleUnit}`;
  const maxGStr = `Max ${stats.maxGrade.toFixed(1)}%`;

  return `
      <text x="${padLeft.toFixed(2)}" y="4.2" fill="${theme.text}" font-size="2.8" font-weight="800" font-family="sans-serif">${title}</text>
      <text x="${(W - padRight).toFixed(2)}" y="4.2" fill="${theme.text}" font-size="2.2" font-weight="700" font-family="monospace" text-anchor="end">
        <tspan fill="${theme.text}">${distStr}</tspan>  <tspan fill="${theme.z1}" font-weight="800">${gainStr}</tspan>  <tspan fill="${theme.z4}" font-weight="800">${maxGStr}</tspan>
      </text>
      <line x1="${padLeft.toFixed(2)}" y1="5.2" x2="${(W - padRight).toFixed(2)}" y2="5.2" stroke="${theme.grid}" stroke-width="0.3"/>
    `;
}

/**
 * Dashed scissor cut guideline around the sticker edge.
 *
 * @param {ProfileContext} ctx
 * @returns {string}
 */
export function renderCutGuide(ctx) {
  const { settings, theme, W, H, radius } = ctx;
  if (!settings.showCutGuidelines) return '';
  return `<rect x="0.2" y="0.2" width="${(W - 0.4).toFixed(2)}" height="${(H - 0.4).toFixed(2)}" rx="${radius}" fill="none" stroke="${theme.cutLine}" stroke-width="0.3" stroke-dasharray="1,1"/>`;
}
