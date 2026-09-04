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

  // Determine dimensions: Dedicated narrow top-tube list decal (default: 35mm wide × 115mm tall)
  const W = Math.max(20, options.widthMm || settings.fuelingWidthMm || 35);
  const H = Math.max(30, options.heightMm || settings.fuelingHeightMm || 115);

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

  // 1. Margins & Available Space
  const padLeft = 2.0;
  const padRight = 2.0;
  const padTop = 1.6;
  const padBottom = 2.0;
  const contentW = W - padLeft - padRight;

  // 2. Header & Column Titles Markup
  let headerMarkup = '';
  let contentY = padTop + 1.0;
  const showHeader = settings.showHeader !== false;

  if (showHeader) {
    const title = escapeXml(settings.title || 'FUELING ROADBOOK');
    const totalDistU = (stats.totalDist * dFactor).toFixed(0);
    const summaryText = `${intakeStats.totalCarbsG}g CHO · ~${targetCarbs}g/h · ${totalDistU}${distUnit}`;

    headerMarkup = `
      <g class="fueling-header">
        <text x="${(W / 2).toFixed(2)}" y="${(padTop + 2.8).toFixed(2)}" fill="${theme.text}" font-size="2.4" font-weight="900" font-family="system-ui, -apple-system, sans-serif" letter-spacing="0.2" text-anchor="middle">${title}</text>
        <text x="${(W / 2).toFixed(2)}" y="${(padTop + 5.2).toFixed(2)}" fill="${theme.textMuted}" font-size="1.7" font-weight="700" font-family="system-ui, -apple-system, monospace" text-anchor="middle">${summaryText}</text>
        <line x1="${padLeft.toFixed(2)}" y1="${(padTop + 6.8).toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${(padTop + 6.8).toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
        <text x="${(padLeft + 0.5).toFixed(2)}" y="${(padTop + 9.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.4" font-weight="800" font-family="monospace">${displayMode === 'time' ? 'TIME' : 'KM'}</text>
        <text x="${(padLeft + 10.5).toFixed(2)}" y="${(padTop + 9.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.4" font-weight="800" font-family="system-ui">CUE</text>
        <text x="${(W - padRight - 0.5).toFixed(2)}" y="${(padTop + 9.5).toFixed(2)}" fill="${theme.textMuted}" font-size="1.4" font-weight="800" font-family="monospace" text-anchor="end">CHO</text>
        <line x1="${padLeft.toFixed(2)}" y1="${(padTop + 10.8).toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${(padTop + 10.8).toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
      </g>
    `;
    contentY = padTop + 11.8;
  }

  // 3. Vertical List Rows Markup
  const footerH = 5.2;
  const contentH = Math.max(10, H - contentY - padBottom - footerH);
  let rowsMarkup = '';
  const itemCount = items.length;

  if (itemCount === 0) {
    rowsMarkup = `
      <text x="${(W / 2).toFixed(2)}" y="${(contentY + (contentH / 2)).toFixed(2)}" fill="${theme.textMuted}" font-size="2.4" font-weight="700" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
        No fueling cues added yet
      </text>
    `;
  } else {
    // Single-column vertical list with adaptive row height
    const rowH = Math.min(8.0, Math.max(4.4, contentH / itemCount));
    const tagW = Math.min(10.0, Math.max(8.0, W * 0.26));
    const fontSize = Math.min(2.2, Math.max(1.6, rowH * 0.42));

    items.forEach((item, idx) => {
      const cellY = contentY + (idx * rowH);

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
      const maxCharLen = W <= 40 ? 12 : 24;
      const name = escapeXml((item.name || 'Fuel').slice(0, maxCharLen));
      const carbs = item.carbsG ? `${item.carbsG}g` : '—';

      // Hazard badge if steep incline or descent
      let hazardBadge = '';
      if (item.isHazard) {
        const isClimb = item.hazardType === 'climb';
        const sign = isClimb ? '▲' : '▼';
        hazardBadge = `<tspan fill="${isClimb ? theme.z4 : theme.z3}" font-weight="900"> ${sign}${Math.abs(item.grade || 0).toFixed(0)}%</tspan>`;
      }

      // Subtle row pill background for high-contrast on-bike glanceability
      const isEven = idx % 2 === 0;
      const bgFill = isEven ? (themeName === 'white' ? '#f8fafc' : 'rgba(255,255,255,0.04)') : 'none';
      const badgeBg = themeName === 'white' ? '#e2e8f0' : 'rgba(255,255,255,0.12)';
      const textY = (rowH / 2) + (fontSize * 0.35);

      rowsMarkup += `
        <g class="fuel-item-row" data-id="${item.id}" transform="translate(${padLeft.toFixed(2)}, ${cellY.toFixed(2)})">
          <rect width="${contentW.toFixed(2)}" height="${(rowH - 0.3).toFixed(2)}" rx="0.6" fill="${bgFill}" />
          
          <!-- Distance / Time Pill -->
          <rect x="0.2" y="0.3" width="${tagW.toFixed(2)}" height="${(rowH - 0.9).toFixed(2)}" rx="0.5" fill="${badgeBg}" />
          <text x="${(0.2 + (tagW / 2)).toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${(fontSize * 0.95).toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="middle">${indexTag}</text>
          
          <!-- Emoji Icon -->
          <text x="${(tagW + 1.8).toFixed(2)}" y="${textY.toFixed(2)}" font-size="${(fontSize * 1.05).toFixed(2)}" text-anchor="middle">${icon}</text>
          
          <!-- Item Name & Hazard -->
          <text x="${(tagW + 3.6).toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${fontSize.toFixed(2)}" font-weight="700" font-family="system-ui, -apple-system, sans-serif">${name}${hazardBadge}</text>
          
          <!-- Carbs Grams Tag (Right Aligned) -->
          <text x="${(contentW - 0.8).toFixed(2)}" y="${textY.toFixed(2)}" fill="${theme.text}" font-size="${fontSize.toFixed(2)}" font-weight="900" font-family="monospace, system-ui, sans-serif" text-anchor="end">${carbs}</text>
        </g>
      `;
    });
  }

  // 4. Footer Summary Markup
  const footerY = H - padBottom - footerH;
  const footerMarkup = `
    <g class="fueling-footer">
      <line x1="${padLeft.toFixed(2)}" y1="${footerY.toFixed(2)}" x2="${(W - padRight).toFixed(2)}" y2="${footerY.toFixed(2)}" stroke="${theme.grid}" stroke-width="0.3"/>
      <text x="${(padLeft + 0.5).toFixed(2)}" y="${(footerY + 3.6).toFixed(2)}" fill="${theme.text}" font-size="1.8" font-weight="900" font-family="monospace">TOTAL</text>
      <text x="${(W - padRight - 0.5).toFixed(2)}" y="${(footerY + 3.6).toFixed(2)}" fill="${theme.text}" font-size="1.8" font-weight="900" font-family="monospace" text-anchor="end">${intakeStats.totalCarbsG}g CHO</text>
    </g>
  `;

  // 5. Cut Guidelines
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
