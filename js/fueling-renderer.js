/**
 * Vector SVG Fueling Sticker Renderer Module
 *
 * Generates millimeter-accurate, print-ready SVG fueling and nutrition stickers
 * designed specifically for bicycle stems and top tubes.
 *
 * Features:
 * - High-glanceability pro cycling cue card list optimized for viewing while riding
 * - Multi-column adaptive roadbook layout (1, 2, or 3 columns based on item density)
 * - Switchable distance (`km`) vs elapsed time (`time`) index markers
 * - Bold icons, high-contrast typography, and carb gram tallies
 * - Sub-millimeter cut guidelines, corner radii, and multi-theme palette support
 *
 * @module fueling-renderer
 */

import { THEMES } from './renderer.js';
import { getUnitFactors, getUnitLabels } from './units.js';
import { calculateHourlyIntake, getStatePacing } from './fueling.js';
import { escapeXml } from './escape.js';

export const CUE_BADGES = {
  gel: { code: 'GEL', bg: '#fef3c7', color: '#b45309', border: '#f59e0b' },
  gel_high_carb: { code: 'HC', bg: '#ffedd5', color: '#c2410c', border: '#f97316' },
  caff_gel: { code: 'CAF', bg: '#fce7f3', color: '#be185d', border: '#ec4899' },
  bottle: { code: 'MIX', bg: '#e0f2fe', color: '#0369a1', border: '#38bdf8' },
  bottle_mix: { code: 'MIX', bg: '#e0f2fe', color: '#0369a1', border: '#38bdf8' },
  bottle_super: { code: 'SUPER', bg: '#dbeafe', color: '#1d4ed8', border: '#3b82f6' },
  bar: { code: 'BAR', bg: '#fef9c3', color: '#a16207', border: '#eab308' },
  food: { code: 'EAT', bg: '#dcfce7', color: '#15803d', border: '#22c55e' },
  feed_zone: { code: 'AID', bg: '#ede9fe', color: '#6d28d9', border: '#8b5cf6' },
  water: { code: 'H2O', bg: '#e0f2fe', color: '#0284c7', border: '#0ea5e9' },
  salt: { code: 'SALT', bg: '#f1f5f9', color: '#475569', border: '#94a3b8' }
};

/**
 * Resolves the visual badge styling for a fueling item.
 *
 * @param {Object} item
 * @param {boolean} [isDark=false]
 * @returns {{ code: string, bg: string, color: string, border: string }}
 */
export function getCueBadgeStyle(item, isDark = false) {
  const typeKey = (item.type || '').toLowerCase();
  const def = CUE_BADGES[typeKey] || {
    code: (item.shortCode || item.type || 'CUE').slice(0, 3).toUpperCase(),
    bg: '#f1f5f9',
    color: '#334155',
    border: '#cbd5e1'
  };

  if (!isDark) {
    return def;
  }
  return {
    code: def.code,
    bg: 'rgba(255, 255, 255, 0.08)',
    color: def.border,
    border: def.border
  };
}

/**
 * Renders the dedicated printable Fueling & Nutrition Sticker SVG.
 *
 * @param {Object} state - Application state snapshot
 * @param {Object} [options={}] - Override options (e.g. isPrint)
 * @returns {string} SVG markup string
 */
export function renderFuelingSVG(state, options = {}) {
  const settings = state.settings || {};
  const fuelingState = state.fueling || {};
  const items = (fuelingState.items || []).filter(it => it && it.enabled !== false);
  const stats = state.stats || { totalDist: 0 };

  // Determine dimensions: Dedicated narrow top-tube list decal (default: 35mm wide × 115mm tall)
  const W = Math.max(20, options.widthMm || settings.fuelingWidthMm || 35);
  const H = Math.max(30, options.heightMm || settings.fuelingHeightMm || 115);

  const radius = settings.radiusMm !== undefined ? settings.radiusMm : 2;

  // Theme resolution
  const isPrint = options.isPrint || false;
  const themeName = isPrint ? 'white' : (settings.theme || 'white');
  const theme = THEMES[themeName] || THEMES['white'];
  const isDark = themeName === 'dark' || themeName === 'neon';

  const { dFactor } = getUnitFactors(settings.units);
  const { dist: distUnit } = getUnitLabels(settings.units);

  const displayMode = fuelingState.mode || 'km'; // 'km' | 'time'
  const targetCarbs = fuelingState.targetCarbsPerHour || 75;
  const avgSpeed = fuelingState.avgSpeedKmh || 25;

  const intakeStats = calculateHourlyIntake(items, stats.totalDist, avgSpeed, getStatePacing(state));

  // 1. Margins & Bounded Content Area
  const padLeft = 1.6;
  const padRight = 1.6;
  const padTop = 1.5;
  const padBottom = 1.8;
  const contentW = W - padLeft - padRight;

  // 2. Strict 4-Slot Column Geometry & Multi-Column Support
  const isMultiCol = W >= 55 && items.length >= 6;
  const numCols = isMultiCol ? 2 : 1;
  const colGap = isMultiCol ? 2.0 : 0;
  const colW = isMultiCol ? (contentW - colGap) / 2 : contentW;

  const wDist = isMultiCol ? Math.max(5.5, Math.min(7.2, colW * 0.22)) : Math.max(6.8, Math.min(8.5, colW * 0.23));
  const wBadge = isMultiCol ? Math.max(4.8, Math.min(6.2, colW * 0.19)) : Math.max(5.8, Math.min(7.2, colW * 0.20));
  const wCarbs = isMultiCol ? Math.max(4.6, Math.min(6.0, colW * 0.18)) : Math.max(5.4, Math.min(6.8, colW * 0.18));

  const xDist = 0.2;
  const xBadge = xDist + wDist + (isMultiCol ? 0.4 : 0.6);
  const xDetail = xBadge + wBadge + (isMultiCol ? 0.6 : 0.8);
  const xCarbs = colW - 0.4;
  const wDetail = Math.max(isMultiCol ? 5.0 : 7.5, (xCarbs - wCarbs) - xDetail - (isMultiCol ? 0.4 : 0.6));

  // 3. Header & Column Titles Markup
  let headerMarkup = '';
  let contentY = padTop + 0.8;
  const showHeader = settings.showHeader !== false;

  if (showHeader) {
    const rawTitle = (settings.title || 'FUELING ROADBOOK').trim();
    const maxTitleChars = Math.max(14, Math.floor(contentW * 0.75));
    const title = escapeXml(rawTitle.length > maxTitleChars ? rawTitle.slice(0, maxTitleChars - 1) + '…' : rawTitle);
    
    // Scale font size dynamically to prevent title overflow
    const titleFontSize = title.length > 18 ? 1.9 : 2.3;
    const totalDistU = (stats.totalDist * dFactor).toFixed(0);
    const summaryText = contentW >= 36
      ? `${intakeStats.totalCarbsG}g CHO · ~${targetCarbs}g/h · ${totalDistU}${distUnit}`
      : `${intakeStats.totalCarbsG}g CHO · ~${targetCarbs}g/h`;

    let colTitlesMarkup = '';
    if (isMultiCol) {
      const c1X = padLeft;
      const c2X = padLeft + colW + colGap;
      colTitlesMarkup = `
        <text x="${(c1X + xDist + (wDist / 2)).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="monospace" text-anchor="middle">${displayMode === 'time' ? 'TIME' : 'KM'}</text>
        <text x="${(c1X + xBadge + (wBadge / 2)).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="system-ui" text-anchor="middle">TYPE</text>
        <text x="${(c1X + xDetail).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="system-ui">CUE</text>
        <text x="${(c1X + xCarbs).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="monospace" text-anchor="end">CHO</text>

        <text x="${(c2X + xDist + (wDist / 2)).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="monospace" text-anchor="middle">${displayMode === 'time' ? 'TIME' : 'KM'}</text>
        <text x="${(c2X + xBadge + (wBadge / 2)).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="system-ui" text-anchor="middle">TYPE</text>
        <text x="${(c2X + xDetail).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="system-ui">CUE</text>
        <text x="${(c2X + xCarbs).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.2" font-weight="800" font-family="monospace" text-anchor="end">CHO</text>
      `;
    } else {
      colTitlesMarkup = `
        <text x="${(padLeft + xDist + (wDist / 2)).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.35" font-weight="800" font-family="monospace" text-anchor="middle">${displayMode === 'time' ? 'TIME' : 'KM'}</text>
        <text x="${(padLeft + xBadge + (wBadge / 2)).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.35" font-weight="800" font-family="system-ui" text-anchor="middle">TYPE</text>
        <text x="${(padLeft + xDetail).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.35" font-weight="800" font-family="system-ui">CUE</text>
        <text x="${(padLeft + xCarbs).toFixed(2)}" y="${(padTop + 9.3).toFixed(2)}" fill="${theme.textMuted}" font-size="1.35" font-weight="800" font-family="monospace" text-anchor="end">CHO</text>
      `;
    }

    headerMarkup = `
      <g class="fueling-header">
        <text x="${(W / 2).toFixed(2)}" y="${(padTop + 2.6).toFixed(2)}" fill="${theme.text}" font-size="${titleFontSize.toFixed(2)}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" letter-spacing="0.2" text-anchor="middle">${title}</text>
        <text x="${(W / 2).toFixed(2)}" y="${(padTop + 5.0).toFixed(2)}" fill="${theme.textMuted}" font-size="1.6" font-weight="700" font-family="system-ui, -apple-system, monospace" text-anchor="middle">${summaryText}</text>
        <line x1="${padLeft.toFixed(2)}" y1="${(padTop + 6.6).toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${(padTop + 6.6).toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
        ${colTitlesMarkup}
        <line x1="${padLeft.toFixed(2)}" y1="${(padTop + 10.6).toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${(padTop + 10.6).toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
      </g>
    `;
    contentY = padTop + 11.6;
  }

  // 4. Vertical List Rows Markup
  const footerH = 4.8;
  const footerY = H - padBottom - footerH;
  const contentH = Math.max(10, footerY - contentY - 0.5);
  let rowsMarkup = '';
  const itemCount = items.length;

  if (itemCount === 0) {
    rowsMarkup = `
      <text x="${(W / 2).toFixed(2)}" y="${(contentY + (contentH / 2)).toFixed(2)}" fill="${theme.textMuted}" font-size="2.2" font-weight="700" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
        No fueling cues added yet
      </text>
    `;
  } else {
    const itemsPerCol = Math.ceil(itemCount / numCols);
    const availableRowH = contentH / itemsPerCol;
    const minRowH = 2.8;
    const rowH = Math.min(7.5, Math.max(minRowH, availableRowH));
    const fontSize = Math.min(2.0, Math.max(1.25, rowH * 0.40));
    const badgeH = Math.max(2.5, rowH - 0.9);
    const badgeY = (rowH - badgeH) / 2;
    const textY = (rowH / 2) + (fontSize * 0.35);

    // Bounded capacity to prevent clobbering footer or bleeding off decal
    const maxFitPerCol = Math.floor(contentH / rowH);
    const maxVisibleTotal = maxFitPerCol * numCols;
    const visibleItems = items.slice(0, maxVisibleTotal);

    visibleItems.forEach((item, idx) => {
      const colIdx = isMultiCol ? Math.floor(idx / maxFitPerCol) : 0;
      const rowIdx = isMultiCol ? (idx % maxFitPerCol) : idx;
      const colX = padLeft + (colIdx * (colW + colGap));
      const cellY = contentY + (rowIdx * rowH);

      // Distance or Time Tag
      let indexTag = '';
      if (displayMode === 'time') {
        const timeSec = item.timeSec || 0;
        const totalMin = Math.round(timeSec / 60);
        const hrs = Math.floor(totalMin / 60);
        const mins = totalMin % 60;
        indexTag = `${hrs}:${mins.toString().padStart(2, '0')}`;
      } else {
        const dVal = (item.distM * dFactor).toFixed(item.distM >= 100000 ? 0 : 1);
        indexTag = `${dVal}${settings.units === 'imperial' ? 'm' : 'k'}`;
      }

      const badgeStyle = getCueBadgeStyle(item, isDark);
      const name = escapeXml(item.name || 'Fuel');
      const carbs = item.carbsG ? `${item.carbsG}g` : '—';

      // Slot 3: Detail or Hazard Alert Markup (strictly bounded)
      let detailMarkup = '';
      if (item.isHazard) {
        const isClimb = item.hazardType === 'climb';
        const sign = isClimb ? '▲' : '▼';
        const gradeVal = `${sign}${Math.abs(item.grade || 0).toFixed(0)}%`;
        const hazardColor = isClimb ? (theme.z4 || '#dc2626') : (theme.z3 || '#ea580c');
        const hazardBg = isDark ? 'rgba(220, 38, 38, 0.20)' : (isClimb ? '#fee2e2' : '#ffedd5');

        if (wDetail >= 18.0) {
          const pillW = Math.min(8.0, wDetail * 0.42);
          const nameX = xDetail + pillW + 0.8;
          const nameW = wDetail - pillW - 1.0;
          const estHazardNameW = name.length * (fontSize * 0.58);
          const hazardTextLengthAttr = estHazardNameW > nameW
            ? ` textLength="${nameW.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`
            : '';
          detailMarkup = `
            <rect x="${xDetail.toFixed(2)}" y="${badgeY.toFixed(2)}" width="${pillW.toFixed(2)}" height="${badgeH.toFixed(2)}" rx="0.5" fill="${hazardBg}" stroke="${hazardColor}" stroke-width="0.25" />
            <text x="${(xDetail + (pillW / 2)).toFixed(2)}" y="${textY.toFixed(2)}" fill="${hazardColor}" font-size="${(fontSize * 0.88).toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="middle">${gradeVal}</text>
            <text x="${nameX.toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${fontSize.toFixed(2)}" font-weight="700" font-family="system-ui, -apple-system, sans-serif"${hazardTextLengthAttr}>${name}</text>
          `;
        } else {
          detailMarkup = `
            <rect x="${xDetail.toFixed(2)}" y="${badgeY.toFixed(2)}" width="${wDetail.toFixed(2)}" height="${badgeH.toFixed(2)}" rx="0.5" fill="${hazardBg}" stroke="${hazardColor}" stroke-width="0.25" />
            <text x="${(xDetail + (wDetail / 2)).toFixed(2)}" y="${textY.toFixed(2)}" fill="${hazardColor}" font-size="${(fontSize * 0.88).toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="middle">${gradeVal}</text>
            <desc>${name}</desc>
          `;
        }
      } else {
        const maxNameW = Math.max(2.0, wDetail - 0.4);
        const estNameW = name.length * (fontSize * 0.58);
        const textLengthAttr = estNameW > maxNameW
          ? ` textLength="${maxNameW.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`
          : '';
        detailMarkup = `
          <text x="${xDetail.toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${fontSize.toFixed(2)}" font-weight="700" font-family="system-ui, -apple-system, sans-serif"${textLengthAttr}>${name}</text>
        `;
      }

      // Alternating row background for glanceability
      const isEven = idx % 2 === 0;
      const bgFill = isEven ? (themeName === 'white' || themeName === 'prism' ? '#f8fafc' : 'rgba(255,255,255,0.04)') : 'none';
      const distBadgeBg = themeName === 'white' || themeName === 'prism' ? '#e2e8f0' : 'rgba(255,255,255,0.10)';

      rowsMarkup += `
        <g class="fuel-item-row" data-id="${escapeXml(item.id)}" transform="translate(${colX.toFixed(2)}, ${cellY.toFixed(2)})">
          <title>${name} (${carbs})</title>
          <rect width="${colW.toFixed(2)}" height="${(rowH - 0.3).toFixed(2)}" rx="0.6" fill="${bgFill}" />
          
          <!-- Slot 1: Distance / Time Pill -->
          <rect x="${xDist.toFixed(2)}" y="${badgeY.toFixed(2)}" width="${wDist.toFixed(2)}" height="${badgeH.toFixed(2)}" rx="0.5" fill="${distBadgeBg}" />
          <text x="${(xDist + (wDist / 2)).toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${(fontSize * 0.92).toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="middle">${indexTag}</text>
          
          <!-- Slot 2: Pro Category Pill -->
          <rect x="${xBadge.toFixed(2)}" y="${badgeY.toFixed(2)}" width="${wBadge.toFixed(2)}" height="${badgeH.toFixed(2)}" rx="0.5" fill="${badgeStyle.bg}" stroke="${badgeStyle.border}" stroke-width="0.25" />
          <text x="${(xBadge + (wBadge / 2)).toFixed(2)}" y="${textY.toFixed(2)}" fill="${badgeStyle.color}" font-size="${(fontSize * 0.88).toFixed(2)}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${badgeStyle.code}</text>
          
          <!-- Slot 3: Detail / Hazard Alert -->
          ${detailMarkup}
          
          <!-- Slot 4: Carbs Grams Tag (Right Aligned) -->
          <text x="${xCarbs.toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${fontSize.toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="end">${carbs}</text>
        </g>
      `;
    });
  }

  // 5. Footer Summary Markup
  const overflowNotice = (items.length > 0 && Math.floor((footerY - contentY) / Math.min(7.5, Math.max(2.8, (footerY - contentY) / Math.ceil(items.length / (W >= 55 && items.length >= 6 ? 2 : 1))))) * (W >= 55 && items.length >= 6 ? 2 : 1) < items.length)
    ? ` · +${items.length - Math.floor((footerY - contentY) / Math.min(7.5, Math.max(2.8, (footerY - contentY) / Math.ceil(items.length / (W >= 55 && items.length >= 6 ? 2 : 1))))) * (W >= 55 && items.length >= 6 ? 2 : 1)} in studio`
    : '';

  const footerMarkup = `
    <g class="fueling-footer">
      <line x1="${padLeft.toFixed(2)}" y1="${footerY.toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${footerY.toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
      <text x="${(padLeft + 0.5).toFixed(2)}" y="${(footerY + 3.4).toFixed(2)}" fill="${theme.text}" font-size="1.8" font-weight="900" font-family="monospace">TOTAL</text>
      <text x="${(W - padRight - 0.5).toFixed(2)}" y="${(footerY + 3.4).toFixed(2)}" fill="${theme.text}" font-size="1.8" font-weight="900" font-family="monospace" text-anchor="end">${intakeStats.totalCarbsG}g CHO${overflowNotice}</text>
    </g>
  `;

  // 6. Cut Guidelines
  let cutMarkup = '';
  if (settings.showCutGuidelines !== false) {
    cutMarkup = `<rect x="0.2" y="0.2" width="${(W - 0.4).toFixed(2)}" height="${(H - 0.4).toFixed(2)}" rx="${radius}" fill="none" stroke="${theme.cutLine}" stroke-width="0.3" stroke-dasharray="1,1"/>`;
  }

  return `
    <svg id="fueling-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      ${headerMarkup}
      ${rowsMarkup}
      ${footerMarkup}
      ${cutMarkup}
    </svg>
  `.trim();
}
