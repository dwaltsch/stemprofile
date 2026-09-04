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
import { calculateHourlyIntake } from './fueling.js';

/**
 * Escapes XML/SVG special characters to prevent markup injection.
 *
 * @param {string} str - Raw string
 * @returns {string} XML-safe string
 */
function escapeXml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

  const W = Math.max(30, settings.widthMm || 110);
  const H = Math.max(15, settings.heightMm || 35);
  const radius = settings.radiusMm !== undefined ? settings.radiusMm : 2;

  // Theme resolution
  const isPrint = options.isPrint || false;
  const themeName = isPrint ? 'white' : (settings.theme || 'white');
  const theme = THEMES[themeName] || THEMES['white'];

  const { dFactor } = getUnitFactors(settings.units);
  const { dist: distUnit } = getUnitLabels(settings.units);

  const displayMode = fuelingState.mode || 'km'; // 'km' | 'time'
  const targetCarbs = fuelingState.targetCarbsPerHour || 75;
  const avgSpeed = fuelingState.avgSpeedKmh || 25;

  const intakeStats = calculateHourlyIntake(items, stats.totalDist, avgSpeed);

  // 1. Header Dimensions & Margins
  const padLeft = 2.5;
  const padRight = 2.5;
  const padTop = 1.5;
  const padBottom = 2.0;

  const contentW = W - padLeft - padRight;
  const headerH = settings.showHeader !== false ? 5.2 : 1.0;
  const contentY = padTop + headerH;
  const contentH = H - contentY - padBottom;

  // 2. Header Markup
  let headerMarkup = '';
  if (settings.showHeader !== false) {
    const title = escapeXml(settings.title || 'FUELING ROADBOOK');
    const totalDistU = (stats.totalDist * dFactor).toFixed(0);
    const summaryRight = `${intakeStats.totalCarbsG}g CHO · ~${targetCarbs}g/h · ${totalDistU}${distUnit}`;

    headerMarkup = `
      <g class="fueling-header">
        <text x="${padLeft.toFixed(2)}" y="${(padTop + 3.2).toFixed(2)}" fill="${theme.text}" font-size="2.6" font-weight="900" font-family="system-ui, -apple-system, sans-serif" letter-spacing="0.2">${title}</text>
        <text x="${(W - padRight).toFixed(2)}" y="${(padTop + 3.2).toFixed(2)}" fill="${theme.textMuted}" font-size="2.1" font-weight="800" font-family="system-ui, -apple-system, monospace" text-anchor="end">${summaryRight}</text>
        <line x1="${padLeft.toFixed(2)}" y1="${(padTop + 4.5).toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${(padTop + 4.5).toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
      </g>
    `;
  }

  // 3. Grid & Column Calculation
  let rowsMarkup = '';
  const itemCount = items.length;

  if (itemCount === 0) {
    rowsMarkup = `
      <text x="${(W / 2).toFixed(2)}" y="${(contentY + (contentH / 2) + 1.0).toFixed(2)}" fill="${theme.textMuted}" font-size="2.6" font-weight="700" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
        No fueling items added yet
      </text>
    `;
  } else {
    // Determine column count based on available width & item count
    let numCols = 1;
    if (W >= 90 && itemCount >= 5) {
      numCols = (W >= 125 && itemCount >= 11) ? 3 : 2;
    } else if (W >= 70 && itemCount >= 7) {
      numCols = 2;
    }

    const colGap = 2.0;
    const colW = (contentW - ((numCols - 1) * colGap)) / numCols;
    const maxRowsPerCol = Math.ceil(itemCount / numCols);
    const rowH = Math.min(6.5, Math.max(3.8, contentH / maxRowsPerCol));

    items.forEach((item, idx) => {
      const colIdx = Math.floor(idx / maxRowsPerCol);
      const rowIdx = idx % maxRowsPerCol;

      const cellX = padLeft + (colIdx * (colW + colGap));
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

      // Formatting Item Text
      const icon = item.icon || '⚡';
      const name = escapeXml((item.name || 'Fuel').slice(0, numCols === 3 ? 12 : 18));
      const carbs = item.carbsG ? `${item.carbsG}g` : '';

      // Hazard badge if steep incline or descent
      let hazardBadge = '';
      if (item.isHazard) {
        const isClimb = item.hazardType === 'climb';
        const sign = isClimb ? '▲' : '▼';
        hazardBadge = `<tspan fill="${isClimb ? theme.z4 : theme.z3}" font-weight="900"> ${sign}${Math.abs(item.grade || 0).toFixed(0)}%</tspan>`;
      }

      // Subtle row pill background for high-contrast on-bike glanceability
      const isEven = rowIdx % 2 === 0;
      const bgFill = isEven ? (themeName === 'white' ? '#f8fafc' : 'rgba(255,255,255,0.04)') : 'none';
      const badgeBg = themeName === 'white' ? '#e2e8f0' : 'rgba(255,255,255,0.12)';

      const tagW = Math.max(9.5, indexTag.length * 1.5 + 2.0);
      const fontSize = Math.min(2.2, Math.max(1.6, rowH * 0.44));

      rowsMarkup += `
        <g class="fuel-item-row" data-id="${item.id}" transform="translate(${cellX.toFixed(2)}, ${cellY.toFixed(2)})">
          <rect width="${colW.toFixed(2)}" height="${(rowH - 0.4).toFixed(2)}" rx="0.6" fill="${bgFill}" />
          
          <!-- Distance / Time Pill -->
          <rect x="0.4" y="0.4" width="${tagW.toFixed(2)}" height="${(rowH - 1.2).toFixed(2)}" rx="0.5" fill="${badgeBg}" />
          <text x="${(0.4 + (tagW / 2)).toFixed(2)}" y="${((rowH / 2) + (fontSize * 0.35)).toFixed(2)}" fill="${theme.text}" font-size="${(fontSize * 0.95).toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="middle">${indexTag}</text>
          
          <!-- Emoji Icon -->
          <text x="${(tagW + 2.0).toFixed(2)}" y="${((rowH / 2) + (fontSize * 0.35)).toFixed(2)}" font-size="${(fontSize * 1.1).toFixed(2)}" text-anchor="middle">${icon}</text>
          
          <!-- Item Name -->
          <text x="${(tagW + 4.2).toFixed(2)}" y="${((rowH / 2) + (fontSize * 0.35)).toFixed(2)}" fill="${theme.text}" font-size="${fontSize.toFixed(2)}" font-weight="700" font-family="system-ui, -apple-system, sans-serif">${name}${hazardBadge}</text>
          
          <!-- Carbs Grams Tag (Right Aligned) -->
          <text x="${(colW - 1.0).toFixed(2)}" y="${((rowH / 2) + (fontSize * 0.35)).toFixed(2)}" fill="${theme.textMuted}" font-size="${fontSize.toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="end">${carbs}</text>
        </g>
      `;
    });
  }

  // 4. Cut Guidelines
  let cutMarkup = '';
  if (settings.showCutGuidelines !== false) {
    cutMarkup = `<rect x="0.2" y="0.2" width="${(W - 0.4).toFixed(2)}" height="${(H - 0.4).toFixed(2)}" rx="${radius}" fill="none" stroke="${theme.cutLine}" stroke-width="0.3" stroke-dasharray="1,1"/>`;
  }

  return `
    <svg id="fueling-svg-elem" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">
      <rect width="100%" height="100%" fill="${theme.bg}"/>
      ${headerMarkup}
      ${rowsMarkup}
      ${cutMarkup}
    </svg>
  `.trim();
}
