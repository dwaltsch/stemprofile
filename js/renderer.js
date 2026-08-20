/**
 * Vector SVG Renderer Module
 * Pro-cycling race stem & top-tube profile generator
 * Optimized for glance-readability at high speed
 */

export const THEME_PALETTES = {
  'dark-cockpit': {
    bg: '#090d14',
    cardBg: '#121824',
    text: '#f8fafc',
    textMuted: '#94a3b8',
    grid: 'rgba(255, 255, 255, 0.08)',
    z1: '#10b981',
    z2: '#eab308',
    z3: '#f97316',
    z4: '#ef4444',
    stroke: '#38bdf8',
    badgeBg: 'rgba(15, 23, 42, 0.9)',
    badgeBorder: '#38bdf8',
    badgeText: '#ffffff'
  },
  'pro-white': {
    bg: '#ffffff',
    cardBg: '#f1f5f9',
    text: '#090d14',
    textMuted: '#334155',
    grid: 'rgba(0, 0, 0, 0.12)',
    z1: '#059669',
    z2: '#d97706',
    z3: '#ea580c',
    z4: '#dc2626',
    stroke: '#090d14',
    badgeBg: '#090d14',
    badgeBorder: '#090d14',
    badgeText: '#ffffff'
  },
  'neon-vis': {
    bg: '#04050a',
    cardBg: '#0b0e1b',
    text: '#00f0ff',
    textMuted: '#a855f7',
    grid: 'rgba(0, 240, 255, 0.15)',
    z1: '#00ff66',
    z2: '#ffea00',
    z3: '#ff0055',
    z4: '#bd00ff',
    stroke: '#00f0ff',
    badgeBg: '#0b0e1b',
    badgeBorder: '#00f0ff',
    badgeText: '#00f0ff'
  },
  'monochrome-race': {
    bg: '#121418',
    cardBg: '#1a1e24',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    grid: 'rgba(255, 255, 255, 0.07)',
    z1: '#64748b',
    z2: '#94a3b8',
    z3: '#cbd5e1',
    z4: '#ffffff',
    stroke: '#ffffff',
    badgeBg: '#1e293b',
    badgeBorder: '#94a3b8',
    badgeText: '#ffffff'
  }
};

export function escapeXml(s) {
  const map = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  };
  return (s || '').replace(/[<>&'"]/g, c => map[c] || c);
}

export function renderProfileSVG(points, stats, climbs = [], cues = [], settings, isPrint = false) {
  const W = settings.widthMm;
  const H = settings.heightMm;
  const radius = settings.radiusMm;
  const theme = THEME_PALETTES[settings.theme] || THEME_PALETTES['dark-cockpit'];

  if (!points || points.length < 2 || !stats) {
    return `<svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      <text x="50%" y="50%" fill="${theme.textMuted}" text-anchor="middle" font-size="3.5" font-family="sans-serif">Drop GPX Track to Render Profile</text>
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

  // Pro Layout Margins (in mm)
  const padLeft = 8.5;
  const padRight = 6.0;
  const hasClimbBadges = settings.showClimbs && climbs && climbs.length > 0;
  const padTop = settings.showHeader ? (hasClimbBadges ? 12.0 : 8.5) : (hasClimbBadges ? 8.0 : 4.0);
  const padBottom = settings.showDistanceTicks ? 5.8 : 3.2;

  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const eleDelta = Math.max(15, stats.maxEle - stats.minEle);
  const minElePadded = Math.max(0, stats.minEle - (eleDelta * 0.05));
  const maxElePadded = stats.maxEle + (eleDelta * 0.08);
  const spanEle = maxElePadded - minElePadded;

  const toX = d => padLeft + ((d / stats.totalDist) * plotW);
  const toY = e => padTop + plotH - (((e - minElePadded) / spanEle) * plotH);

  // 1. Multi-tier gradient polygon slices (<5%, 5-8%, 8-12%, >12%)
  const zoneColors = [theme.z1, theme.z2, theme.z3, theme.z4];
  let slicesMarkup = '';
  const opacity = isPrint && settings.theme === 'pro-white' ? '0.9' : '0.82';

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const x1 = toX(p1.dist).toFixed(2);
    const x2 = toX(p2.dist).toFixed(2);
    const y1 = toY(p1.smoothEle).toFixed(2);
    const y2 = toY(p2.smoothEle).toFixed(2);
    const yBase = (padTop + plotH).toFixed(2);

    slicesMarkup += `<polygon points="${x1},${yBase} ${x1},${y1} ${x2},${y2} ${x2},${yBase}" fill="${zoneColors[p2.zone]}" fill-opacity="${opacity}"/>`;
  }

  // 2. Profile top boundary stroke
  let pathD = `M ${toX(points[0].dist).toFixed(2)} ${toY(points[0].smoothEle).toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${toX(points[i].dist).toFixed(2)} ${toY(points[i].smoothEle).toFixed(2)}`;
  }
  const topStroke = isPrint && settings.theme === 'pro-white' ? '#090d14' : '#ffffff';
  const strokeMarkup = `<path d="${pathD}" fill="none" stroke="${topStroke}" stroke-width="0.55" stroke-linejoin="round" stroke-linecap="round"/>`;

  // 3. Highlighted Climb Segments & Summit Badges (Pro-Style)
  let climbBadgesMarkup = '';
  if (settings.showClimbs && climbs && climbs.length > 0) {
    climbs.forEach(climb => {
      const startX = toX(climb.startKm * 1000);
      const summitX = toX(climb.summitKm * 1000);
      const summitY = toY(climb.summitEle);

      // Climb under-bracket or baseline indicator
      const baseLineY = (padTop + plotH + 0.6).toFixed(2);
      climbBadgesMarkup += `
        <line x1="${startX.toFixed(2)}" y1="${baseLineY}" x2="${summitX.toFixed(2)}" y2="${baseLineY}" stroke="${theme.z3}" stroke-width="0.8"/>
        <circle cx="${summitX.toFixed(2)}" cy="${summitY.toFixed(2)}" r="1.0" fill="${theme.z4}" stroke="#ffffff" stroke-width="0.3"/>
      `;

      // Summit Banner Badge
      const badgeY = Math.max(padTop - 4.2, summitY - 5.5).toFixed(2);
      const labelText = `${climb.category} • ${climb.lengthKm.toFixed(1)}k @ ${climb.avgGrade}%`;
      const badgeW = Math.min(28, labelText.length * 1.7 + 4);

      climbBadgesMarkup += `
        <g transform="translate(${Math.max(padLeft, Math.min(W - padRight - badgeW, summitX - (badgeW / 2))).toFixed(2)}, ${badgeY})">
          <rect width="${badgeW}" height="3.6" rx="0.8" fill="${theme.badgeBg}" stroke="${theme.z4}" stroke-width="0.35"/>
          <text x="${badgeW / 2}" y="2.5" fill="${theme.badgeText}" font-size="1.9" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${labelText}</text>
        </g>
        <line x1="${summitX.toFixed(2)}" y1="${(parseFloat(badgeY) + 3.6).toFixed(2)}" x2="${summitX.toFixed(2)}" y2="${(summitY - 1.2).toFixed(2)}" stroke="${theme.z4}" stroke-width="0.25" stroke-dasharray="0.5,0.5"/>
      `;
    });
  }

  // 4. Custom Cue Pins (Feed zones, Sprints, Water, Gravel)
  let cuesMarkup = '';
  if (settings.showCues && cues && cues.length > 0) {
    cues.forEach(cue => {
      const cueMeters = cue.km * 1000;
      if (cueMeters <= stats.totalDist) {
        const cx = toX(cueMeters).toFixed(2);
        const cy1 = padTop.toFixed(2);
        const cy2 = (padTop + plotH).toFixed(2);
        
        let iconSymbol = '📍';
        if (cue.type === 'feed') iconSymbol = '🥛';
        else if (cue.type === 'sprint') iconSymbol = '⚡';
        else if (cue.type === 'gravel') iconSymbol = '🪨';
        else if (cue.type === 'hazard') iconSymbol = '⚠️';

        cuesMarkup += `
          <g>
            <line x1="${cx}" y1="${cy1}" x2="${cx}" y2="${cy2}" stroke="${theme.stroke}" stroke-width="0.35" stroke-dasharray="0.8,0.8"/>
            <circle cx="${cx}" cy="${(padTop - 1.2).toFixed(2)}" r="1.4" fill="${theme.cardBg}" stroke="${theme.stroke}" stroke-width="0.3"/>
            <text x="${cx}" y="${(padTop - 0.5).toFixed(2)}" font-size="1.8" text-anchor="middle">${iconSymbol}</text>
          </g>
        `;
      }
    });
  }

  // 5. Grid lines & Distance axis
  let gridMarkup = '';
  if (settings.showDistanceTicks) {
    let stepKm = 5;
    if (totalDistU > 120) stepKm = 25;
    else if (totalDistU > 60) stepKm = 10;
    else if (totalDistU > 20) stepKm = 5;
    else if (totalDistU > 8) stepKm = 2;
    else stepKm = 1;

    const stepMeters = stepKm / dFactor;
    const count = Math.floor(stats.totalDist / stepMeters);

    for (let t = 1; t <= count; t++) {
      const tickD = t * stepMeters;
      const x = toX(tickD).toFixed(2);
      const y1 = padTop.toFixed(2);
      const y2 = (padTop + plotH).toFixed(2);

      gridMarkup += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${theme.grid}" stroke-width="0.25" stroke-dasharray="0.6,0.6"/>`;
      gridMarkup += `<text x="${x}" y="${(padTop + plotH + 2.8).toFixed(2)}" fill="${theme.textMuted}" font-size="2.2" font-family="monospace" font-weight="700" text-anchor="middle">${t * stepKm}</text>`;
    }

    gridMarkup += `<text x="${(padLeft + plotW).toFixed(2)}" y="${(padTop + plotH + 2.8).toFixed(2)}" fill="${theme.textMuted}" font-size="1.9" font-weight="800" font-family="system-ui, sans-serif" text-anchor="end">${distUnit}</text>`;
    gridMarkup += `<text x="${padLeft.toFixed(2)}" y="${(padTop + plotH + 2.8).toFixed(2)}" fill="${theme.textMuted}" font-size="2.2" font-weight="700" font-family="monospace" text-anchor="start">0</text>`;
  }

  // 6. Min / Max Altitude labels
  let eleMarkup = '';
  if (settings.showElevationLabels) {
    const minStr = `${Math.round(minEleU)}${eleUnit}`;
    const maxStr = `${Math.round(maxEleU)}${eleUnit}`;
    const yMin = toY(stats.minEle).toFixed(2);
    const yMax = toY(stats.maxEle).toFixed(2);

    eleMarkup += `<text x="${(padLeft - 1.2).toFixed(2)}" y="${(parseFloat(yMax) + 1.1).toFixed(2)}" fill="${theme.textMuted}" font-size="2.0" font-weight="700" font-family="system-ui, sans-serif" text-anchor="end">${maxStr}</text>`;
    eleMarkup += `<text x="${(padLeft - 1.2).toFixed(2)}" y="${(parseFloat(yMin) + 0.8).toFixed(2)}" fill="${theme.textMuted}" font-size="2.0" font-weight="600" font-family="system-ui, sans-serif" text-anchor="end">${minStr}</text>`;
  }

  // 7. Header Title & Race Stats Banner
  let headerMarkup = '';
  if (settings.showHeader) {
    const titleSafe = escapeXml(settings.title || 'StemProfile');
    const distStr = `${totalDistU.toFixed(1)} ${distUnit}`;
    const gainStr = `+${Math.round(elevGainU)} ${eleUnit}`;
    const maxGStr = `Max ${stats.maxGrade.toFixed(1)}%`;

    headerMarkup += `
      <g>
        <text x="${padLeft}" y="4.6" fill="${theme.text}" font-size="3.2" font-weight="800" font-family="system-ui, -apple-system, sans-serif" letter-spacing="-0.02em">${titleSafe}</text>
        <text x="${(W - padRight).toFixed(2)}" y="4.4" fill="${theme.textMuted}" font-size="2.4" font-weight="700" font-family="monospace" text-anchor="end">
          <tspan fill="${theme.text}">${distStr}</tspan>  <tspan fill="${theme.z1}">${gainStr}</tspan>  <tspan fill="${theme.z4}">${maxGStr}</tspan>
        </text>
        <line x1="${padLeft}" y1="5.8" x2="${(W - padRight).toFixed(2)}" y2="5.8" stroke="${theme.grid}" stroke-width="0.3"/>
      </g>
    `;
  }

  // 8. Mini Gradient Legend
  let legendMarkup = '';
  if (settings.showGradientLegend) {
    const lx = (W - padRight - 23).toFixed(2);
    const ly = (padTop + 0.8).toFixed(2);
    legendMarkup += `
      <g opacity="0.92">
        <rect x="${lx}" y="${ly}" width="22" height="1.8" rx="0.4" fill="${theme.cardBg}" stroke="${theme.grid}" stroke-width="0.2"/>
        <rect x="${(parseFloat(lx) + 0.6).toFixed(2)}" y="${(parseFloat(ly) + 0.3).toFixed(2)}" width="4.6" height="1.2" rx="0.2" fill="${theme.z1}"/>
        <rect x="${(parseFloat(lx) + 5.8).toFixed(2)}" y="${(parseFloat(ly) + 0.3).toFixed(2)}" width="4.6" height="1.2" rx="0.2" fill="${theme.z2}"/>
        <rect x="${(parseFloat(lx) + 11.0).toFixed(2)}" y="${(parseFloat(ly) + 0.3).toFixed(2)}" width="4.6" height="1.2" rx="0.2" fill="${theme.z3}"/>
        <rect x="${(parseFloat(lx) + 16.2).toFixed(2)}" y="${(parseFloat(ly) + 0.3).toFixed(2)}" width="4.6" height="1.2" rx="0.2" fill="${theme.z4}"/>
      </g>
    `;
  }

  // 9. Outer Cut Guidelines
  let cutMarkup = '';
  if (settings.showCutGuidelines) {
    const cutColor = isPrint ? '#475569' : 'rgba(255,255,255,0.18)';
    cutMarkup = `<rect x="0.2" y="0.2" width="${(W - 0.4).toFixed(2)}" height="${(H - 0.4).toFixed(2)}" rx="${radius}" fill="none" stroke="${cutColor}" stroke-width="0.35" stroke-dasharray="1.0,1.0"/>`;
  }

  return `
    <svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <defs>
        <clipPath id="clip-bounds">
          <rect x="0" y="0" width="${W}" height="${H}" rx="${radius}"/>
        </clipPath>
      </defs>
      <g clip-path="url(#clip-bounds)">
        <rect width="100%" height="100%" fill="${theme.bg}"/>
        ${gridMarkup}
        ${slicesMarkup}
        ${strokeMarkup}
        ${climbBadgesMarkup}
        ${cuesMarkup}
        ${eleMarkup}
        ${headerMarkup}
        ${legendMarkup}
      </g>
      ${cutMarkup}
    </svg>
  `.trim();
}
