/**
 * Vector SVG Profile Renderer
 * Supports both Block-Segmented (1000m, 500m, 250m, 100m) and Smooth Continuous modes
 */

import { getInterpolatedEle } from './signal.js';

export const THEMES = {
  'dark': {
    bg: '#0d1117',
    text: '#f0f6fc',
    textMuted: '#8b949e',
    grid: 'rgba(255, 255, 255, 0.1)',
    topStroke: '#ffffff',
    divider: '#0d1117',
    blockStroke: 'rgba(0, 0, 0, 0.4)',
    badgeBg: '#161b22',
    badgeStroke: '#30363d',
    badgeText: '#f0f6fc',
    cutLine: 'rgba(255, 255, 255, 0.2)',
    z1: '#2ea043',
    z2: '#d29922',
    z3: '#db6d28',
    z4: '#f85149'
  },
  'white': {
    bg: '#ffffff',
    text: '#0d1117',
    textMuted: '#57606a',
    grid: 'rgba(0, 0, 0, 0.1)',
    topStroke: '#0d1117',
    divider: '#ffffff',
    blockStroke: 'rgba(0, 0, 0, 0.2)',
    badgeBg: '#ffffff',
    badgeStroke: '#0d1117',
    badgeText: '#0d1117',
    cutLine: 'rgba(0, 0, 0, 0.25)',
    z1: '#1a7f37',
    z2: '#9a6700',
    z3: '#bc4c00',
    z4: '#cf222e'
  }
};

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

export function escapeXml(s) {
  const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
  return (s || '').replace(/[<>&'"]/g, c => map[c] || c);
}

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
  const themeKey = isPrint ? 'white' : (settings.theme === 'white' ? 'white' : 'dark');
  const theme = THEMES[themeKey] || THEMES['dark'];

  if (!points || points.length < 2 || !stats) {
    return `<svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      <text x="50%" y="50%" fill="${theme.textMuted}" text-anchor="middle" font-size="3" font-family="sans-serif">Drop GPX to render profile</text>
    </svg>`;
  }

  const isMetric = settings.units === 'metric';
  const distUnit = isMetric ? 'km' : 'mi';
  const eleUnit = isMetric ? 'm' : 'ft';
  const dFactor = isMetric ? 1 / 1000 : 0.000621371;
  const eFactor = isMetric ? 1 : 3.28084;

  const totalDistU = stats.totalDist * dFactor;
  const elevGainU = stats.elevGain * eFactor;
  const minEleU = stats.minEle * eFactor;
  const maxEleU = stats.maxEle * eFactor;

  // Exact Layout Padding (mm)
  const padLeft = 7.5;
  const padRight = 5.0;
  const hasClimbs = settings.showClimbs && climbs && climbs.length > 0;
  const padTop = settings.showHeader ? (hasClimbs ? 10.5 : 7.5) : (hasClimbs ? 7.0 : 3.5);
  const padBottom = settings.showDistanceTicks ? 5.0 : 2.5;

  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const yBase = padTop + plotH;

  const eleRange = Math.max(20, stats.maxEle - stats.minEle);
  const minElePadded = Math.max(0, stats.minEle - (eleRange * 0.05));
  const maxElePadded = stats.maxEle + (eleRange * 0.08);
  const spanEle = maxElePadded - minElePadded;

  const toX = d => padLeft + ((d / stats.totalDist) * plotW);
  const toY = e => padTop + plotH - (((e - minElePadded) / spanEle) * plotH);

  const zoneColors = [theme.z1, theme.z2, theme.z3, theme.z4];
  let profileBodyMarkup = '';
  let topPath = '';

  const isBlockMode = blocks && blocks.length > 0;

  if (isBlockMode) {
    // 1. Render Segmented Block Columns (1km / 500m / 250m / 100m)
    let blocksPolygons = '';
    let blockDividers = '';
    let blockTextLabels = '';

    topPath = `M ${toX(blocks[0].startDist).toFixed(2)} ${toY(blocks[0].startEle).toFixed(2)}`;

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

      // Block Percentage Text (for wide enough blocks)
      if (settings.showBlockPct !== false && blockWidthMm >= 4.2) {
        const midX = ((x1 + x2) / 2).toFixed(2);
        const topMidY = (y1 + y2) / 2;
        const textY = (topMidY + (yBase - topMidY) * 0.45).toFixed(2);
        const gradeText = `${Math.round(b.absGrade)}%`;

        blockTextLabels += `
          <text x="${midX}" y="${textY}" fill="#ffffff" font-size="1.8" font-weight="800" font-family="monospace" text-anchor="middle" opacity="0.95">${gradeText}</text>
        `;
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
        <text x="${x}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.9" font-family="monospace" text-anchor="middle">${t * stepKm}</text>
      `;
    }
    gridMarkup += `
      <text x="${padLeft.toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.9" font-family="monospace" text-anchor="start">0</text>
      <text x="${(padLeft + plotW).toFixed(2)}" y="${(yBase + 2.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.7" font-weight="600" font-family="sans-serif" text-anchor="end">${distUnit}</text>
    `;
  }

  // 4. Min / Max Altitude Labels
  let eleMarkup = '';
  if (settings.showElevationLabels) {
    const minStr = `${Math.round(minEleU)}${eleUnit}`;
    const maxStr = `${Math.round(maxEleU)}${eleUnit}`;
    eleMarkup += `
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.maxEle) + 0.9).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-family="sans-serif" text-anchor="end">${maxStr}</text>
      <text x="${(padLeft - 1.0).toFixed(2)}" y="${(toY(stats.minEle) + 0.6).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-family="sans-serif" text-anchor="end">${minStr}</text>
    `;
  }

  // 5. Climb Summit Badges
  let climbsMarkup = '';
  if (settings.showClimbs && climbs && climbs.length > 0) {
    climbs.forEach(climb => {
      const summitX = toX(climb.summitKm * 1000);
      const summitY = toY(climb.summitEle);
      const label = `${climb.category} • ${climb.lengthKm.toFixed(1)}k @ ${climb.avgGrade}%`;
      const badgeW = Math.min(26, label.length * 1.5 + 3.5);
      const badgeY = Math.max(padTop - 3.8, summitY - 5.0);

      climbsMarkup += `
        <circle cx="${summitX.toFixed(2)}" cy="${summitY.toFixed(2)}" r="0.9" fill="${theme.z4}" stroke="${theme.topStroke}" stroke-width="0.3"/>
        <g transform="translate(${Math.max(padLeft, Math.min(W - padRight - badgeW, summitX - (badgeW / 2))).toFixed(2)}, ${badgeY.toFixed(2)})">
          <rect width="${badgeW}" height="3.2" rx="0.6" fill="${theme.badgeBg}" stroke="${theme.badgeStroke}" stroke-width="0.3"/>
          <text x="${badgeW / 2}" y="2.2" fill="${theme.badgeText}" font-size="1.7" font-weight="700" font-family="sans-serif" text-anchor="middle">${label}</text>
        </g>
      `;
    });
  }

  // 6. Waypoints & Race Cues
  let waypointsMarkup = '';
  const showWaypoints = settings.showWaypoints !== false;
  const showWptLabels = settings.showWaypointLabels !== false;
  const activeWaypoints = (waypoints || []).filter(w => w && w.enabled !== false && w.distM >= 0 && w.distM <= stats.totalDist);

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

      // Staggering: if near previous waypoint, alternate height tier
      let isStaggered = false;
      if (idx > 0) {
        const prevWptX = toX(sortedWpts[idx - 1].distM);
        if (Math.abs(wptX - prevWptX) < 9.0) {
          isStaggered = (idx % 2 === 1);
        }
      }

      const badgeR = 2.0; // 4.0mm diameter pin
      let badgeY = isStaggered ? (padTop - 2.6) : Math.max(padTop - 3.6, profY - 7.5);
      if (badgeY < 2.5) badgeY = 2.5;
      if (badgeY > H - 6.0) badgeY = H - 6.0;

      // Drop Line from pin badge down to profile surface
      const dropLine = `
        <line x1="${wptX.toFixed(2)}" y1="${(badgeY + badgeR).toFixed(2)}" x2="${wptX.toFixed(2)}" y2="${profY.toFixed(2)}" stroke="${typeCfg.color}" stroke-width="0.35" stroke-dasharray="0.6,0.4" opacity="0.95"/>
        <circle cx="${wptX.toFixed(2)}" cy="${profY.toFixed(2)}" r="0.75" fill="${typeCfg.color}" stroke="${theme.bg}" stroke-width="0.25"/>
      `;

      // Icon Pin
      const glyph = renderWaypointGlyph(wpt.type, typeCfg.textColor);
      const pinMarkup = `
        <g transform="translate(${wptX.toFixed(2)}, ${badgeY.toFixed(2)})">
          <circle cx="0" cy="0" r="${badgeR}" fill="${typeCfg.color}" stroke="${isPrint ? '#000000' : theme.bg}" stroke-width="0.35"/>
          ${glyph}
        </g>
      `;

      // High contrast label
      let textMarkup = '';
      if (showWptLabels) {
        const tagText = customLabel ? `${distStr} ${customLabel}` : `${distStr} ${typeCfg.shortCode}`;
        const tagW = Math.min(26, tagText.length * 1.35 + 2.4);
        const tagX = Math.max(padLeft, Math.min(W - padRight - tagW, wptX - (tagW / 2)));
        let tagY = badgeY + badgeR + 0.6;
        if (tagY + 2.6 > profY && badgeY - 3.2 >= 1.0) {
          tagY = badgeY - badgeR - 2.8;
        }

        textMarkup = `
          <g transform="translate(${tagX.toFixed(2)}, ${tagY.toFixed(2)})">
            <rect width="${tagW.toFixed(2)}" height="2.6" rx="0.5" fill="${theme.badgeBg}" stroke="${typeCfg.color}" stroke-width="0.25"/>
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
      <text x="${padLeft.toFixed(2)}" y="4.2" fill="${theme.text}" font-size="2.8" font-weight="700" font-family="sans-serif">${title}</text>
      <text x="${(W - padRight).toFixed(2)}" y="4.2" fill="${theme.textMuted}" font-size="2.2" font-family="monospace" text-anchor="end">
        <tspan fill="${theme.text}">${distStr}</tspan>  <tspan fill="${theme.z1}">${gainStr}</tspan>  <tspan fill="${theme.z4}">${maxGStr}</tspan>
      </text>
      <line x1="${padLeft.toFixed(2)}" y1="5.2" x2="${(W - padRight).toFixed(2)}" y2="5.2" stroke="${theme.grid}" stroke-width="0.25"/>
    `;
  }

  // 8. Cut Guidelines
  let cutMarkup = '';
  if (settings.showCutGuidelines) {
    cutMarkup = `<rect x="0.2" y="0.2" width="${(W - 0.4).toFixed(2)}" height="${(H - 0.4).toFixed(2)}" rx="${radius}" fill="none" stroke="${theme.cutLine}" stroke-width="0.3" stroke-dasharray="1,1"/>`;
  }

  return `
    <svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
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
