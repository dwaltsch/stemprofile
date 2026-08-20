/**
 * Vector SVG Renderer Module
 * Generates exact physical millimeter-scale vector profiles with gradient zones
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
    stroke: '#38bdf8'
  },
  'high-contrast-light': {
    bg: '#ffffff',
    cardBg: '#f8fafc',
    text: '#090d14',
    textMuted: '#475569',
    grid: 'rgba(0, 0, 0, 0.12)',
    z1: '#059669',
    z2: '#d97706',
    z3: '#ea580c',
    z4: '#dc2626',
    stroke: '#090d14'
  },
  'neon-cyber': {
    bg: '#04050a',
    cardBg: '#0b0e1b',
    text: '#00f0ff',
    textMuted: '#9333ea',
    grid: 'rgba(0, 240, 255, 0.14)',
    z1: '#00ff66',
    z2: '#ffea00',
    z3: '#ff0055',
    z4: '#bd00ff',
    stroke: '#00f0ff'
  },
  'nordic-mono': {
    bg: '#14171c',
    cardBg: '#1c2128',
    text: '#f1f5f9',
    textMuted: '#8b949e',
    grid: 'rgba(255, 255, 255, 0.06)',
    z1: '#34d399',
    z2: '#fbbf24',
    z3: '#fb923c',
    z4: '#f87171',
    stroke: '#e2e8f0'
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

export function renderProfileSVG(points, stats, settings, isPrint = false) {
  const W = settings.widthMm;
  const H = settings.heightMm;
  const radius = settings.radiusMm;
  const theme = THEME_PALETTES[settings.theme] || THEME_PALETTES['dark-cockpit'];

  if (!points || points.length < 2 || !stats) {
    return `<svg id="profile-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      <text x="50%" y="50%" fill="${theme.textMuted}" text-anchor="middle" font-size="3.5" font-family="sans-serif">Drop GPX to Render Profile</text>
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

  const padLeft = 8.0;
  const padRight = 6.0;
  const padTop = settings.showHeader ? 9.2 : 4.5;
  const padBottom = settings.showDistanceTicks ? 6.2 : 3.5;

  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const eleDelta = Math.max(15, stats.maxEle - stats.minEle);
  const minElePadded = Math.max(0, stats.minEle - (eleDelta * 0.07));
  const maxElePadded = stats.maxEle + (eleDelta * 0.07);
  const spanEle = maxElePadded - minElePadded;

  const toX = d => padLeft + ((d / stats.totalDist) * plotW);
  const toY = e => padTop + plotH - (((e - minElePadded) / spanEle) * plotH);

  // 1. Multi-zone polygon slices (<5%, 5-8%, 8-12%, >12%)
  const zoneColors = [theme.z1, theme.z2, theme.z3, theme.z4];
  let slicesMarkup = '';
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const x1 = toX(p1.dist).toFixed(2);
    const x2 = toX(p2.dist).toFixed(2);
    const y1 = toY(p1.smoothEle).toFixed(2);
    const y2 = toY(p2.smoothEle).toFixed(2);
    const yBase = (padTop + plotH).toFixed(2);

    slicesMarkup += `<polygon points="${x1},${yBase} ${x1},${y1} ${x2},${y2} ${x2},${yBase}" fill="${zoneColors[p2.zone]}" fill-opacity="${isPrint && settings.theme === 'high-contrast-light' ? '0.88' : '0.8'}"/>`;
  }

  // 2. Profile top boundary stroke
  let pathD = `M ${toX(points[0].dist).toFixed(2)} ${toY(points[0].smoothEle).toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${toX(points[i].dist).toFixed(2)} ${toY(points[i].smoothEle).toFixed(2)}`;
  }
  const topStroke = isPrint && settings.theme === 'high-contrast-light' ? '#090d14' : '#ffffff';
  const strokeMarkup = `<path d="${pathD}" fill="none" stroke="${topStroke}" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/>`;

  // 3. Grid lines & Distance axis
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
      gridMarkup += `<text x="${x}" y="${(padTop + plotH + 3.0).toFixed(2)}" fill="${theme.textMuted}" font-size="2.1" font-family="monospace" font-weight="600" text-anchor="middle">${t * stepKm}</text>`;
    }

    gridMarkup += `<text x="${(padLeft + plotW).toFixed(2)}" y="${(padTop + plotH + 3.0).toFixed(2)}" fill="${theme.textMuted}" font-size="1.9" font-weight="700" font-family="sans-serif" text-anchor="end">${distUnit}</text>`;
    gridMarkup += `<text x="${padLeft.toFixed(2)}" y="${(padTop + plotH + 3.0).toFixed(2)}" fill="${theme.textMuted}" font-size="2.1" font-weight="600" font-family="sans-serif" text-anchor="start">0</text>`;
  }

  // 4. Min / Max Altitude labels
  let eleMarkup = '';
  if (settings.showElevationLabels) {
    const minStr = `${Math.round(minEleU)}${eleUnit}`;
    const maxStr = `${Math.round(maxEleU)}${eleUnit}`;
    const yMin = toY(stats.minEle).toFixed(2);
    const yMax = toY(stats.maxEle).toFixed(2);

    eleMarkup += `<text x="${(padLeft - 1.2).toFixed(2)}" y="${(parseFloat(yMax) + 1.1).toFixed(2)}" fill="${theme.textMuted}" font-size="2.0" font-weight="700" font-family="sans-serif" text-anchor="end">${maxStr}</text>`;
    eleMarkup += `<text x="${(padLeft - 1.2).toFixed(2)}" y="${(parseFloat(yMin) + 0.8).toFixed(2)}" fill="${theme.textMuted}" font-size="2.0" font-weight="600" font-family="sans-serif" text-anchor="end">${minStr}</text>`;
  }

  // 5. Header Title & Race Stats Badge
  let headerMarkup = '';
  if (settings.showHeader) {
    const titleSafe = escapeXml(settings.title || 'StemProfile');
    const distStr = `${totalDistU.toFixed(1)} ${distUnit}`;
    const gainStr = `+${Math.round(elevGainU)} ${eleUnit}`;
    const maxGStr = `Max ${stats.maxGrade.toFixed(1)}%`;

    headerMarkup += `
      <g>
        <text x="${padLeft}" y="5.0" fill="${theme.text}" font-size="3.2" font-weight="800" font-family="system-ui, sans-serif" letter-spacing="-0.02em">${titleSafe}</text>
        <text x="${(W - padRight).toFixed(2)}" y="4.8" fill="${theme.textMuted}" font-size="2.4" font-weight="700" font-family="monospace" text-anchor="end">
          <tspan fill="${theme.text}">${distStr}</tspan>  <tspan fill="${theme.z1}">${gainStr}</tspan>  <tspan fill="${theme.z4}">${maxGStr}</tspan>
        </text>
        <line x1="${padLeft}" y1="6.5" x2="${(W - padRight).toFixed(2)}" y2="6.5" stroke="${theme.grid}" stroke-width="0.3"/>
      </g>
    `;
  }

  // 6. Mini Gradient Legend
  let legendMarkup = '';
  if (settings.showGradientLegend) {
    const lx = (W - padRight - 25).toFixed(2);
    const ly = (padTop + 1.0).toFixed(2);
    legendMarkup += `
      <g opacity="0.9">
        <rect x="${lx}" y="${ly}" width="24" height="2.0" rx="0.4" fill="${theme.cardBg}" stroke="${theme.grid}" stroke-width="0.2"/>
        <rect x="${(parseFloat(lx) + 0.8).toFixed(2)}" y="${(parseFloat(ly) + 0.4).toFixed(2)}" width="5.0" height="1.2" rx="0.2" fill="${theme.z1}"/>
        <rect x="${(parseFloat(lx) + 6.6).toFixed(2)}" y="${(parseFloat(ly) + 0.4).toFixed(2)}" width="5.0" height="1.2" rx="0.2" fill="${theme.z2}"/>
        <rect x="${(parseFloat(lx) + 12.4).toFixed(2)}" y="${(parseFloat(ly) + 0.4).toFixed(2)}" width="5.0" height="1.2" rx="0.2" fill="${theme.z3}"/>
        <rect x="${(parseFloat(lx) + 18.2).toFixed(2)}" y="${(parseFloat(ly) + 0.4).toFixed(2)}" width="5.0" height="1.2" rx="0.2" fill="${theme.z4}"/>
      </g>
    `;
  }

  // 7. Outer Cut Guides
  let cutMarkup = '';
  if (settings.showCutGuidelines) {
    const cutColor = isPrint ? '#64748b' : 'rgba(255,255,255,0.18)';
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
        ${eleMarkup}
        ${headerMarkup}
        ${legendMarkup}
      </g>
      ${cutMarkup}
    </svg>
  `.trim();
}
