/**
 * File exports: SVG download, clipboard copy, and 300 DPI PNG rasterization for single stickers and full sheets.
 *
 * @module export/download
 */

import { THEMES, renderProfileSVG } from '../renderer.js';
import { generatePrintSheetMarkup } from './print-sheet.js';
import { renderFuelingSVG } from '../fueling-renderer.js';
import { resolveExportParams } from './config.js';
import { getDetailClimbs, renderClimbDetailStackSVG } from '../renderer/climb-detail.js';

/**
 * Renders whatever the workbench is showing: the fueling cue sheet, the stack
 * of climb detail stickers, or the elevation profile.
 *
 * @param {Object} p - Resolved export params
 * @param {string} themeKey - Theme to render with
 * @returns {{ svg: string, wMm: number, hMm: number, baseName: string }}
 */
export function renderActiveSticker(p, themeKey) {
  const settings = { ...p.settings, theme: themeKey };
  if (p.activeView === 'fueling') {
    return {
      svg: renderFuelingSVG({ ...p, settings }, { isPrint: false }),
      wMm: p.settings.fuelingWidthMm || 35,
      hMm: p.settings.fuelingHeightMm || 115,
      baseName: `${p.settings.title || 'route'}_fueling_plan`
    };
  }
  if (p.climbDetail && getDetailClimbs(p).length > 0) {
    const stack = renderClimbDetailStackSVG({ ...p, settings });
    return {
      svg: stack.svg,
      wMm: stack.widthMm,
      hMm: stack.heightMm,
      baseName: `${p.settings.title || 'route'}_climbs`
    };
  }
  return {
    svg: renderProfileSVG({ ...p, settings, isPrint: false }),
    wMm: p.settings.widthMm || 110,
    hMm: p.settings.heightMm || 35,
    baseName: p.settings.title || 'stem_profile'
  };
}

/**
 * Exports and downloads the generated profile as a vector `.svg` file.
 *
 * @param {import('./signal.js').ProfilePoint[]|Object} pointsOrOptions - Profile coordinates or state options object
 * @param {import('./signal.js').RouteStats} [stats] - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} [settings={}] - Physical dimensions and styling settings
 */
export function exportSVG(pointsOrOptions, stats, climbs, blocks, waypoints, settings) {
  const p = resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings);
  const themeKey = THEMES[p.settings.theme] ? p.settings.theme : 'white';
  const { svg: svgMarkup, wMm: curW, hMm: curH, baseName } = renderActiveSticker(p, themeKey);

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = baseName.toLowerCase().replace(/[^a-z0-9]/g, '_') +
    `_${curW}x${curH}mm.svg`;

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies the raw SVG markup directly to the system clipboard.
 *
 * @param {import('./signal.js').ProfilePoint[]|Object} pointsOrOptions - Profile coordinates or state options object
 * @param {import('./signal.js').RouteStats} [stats] - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} [settings={}] - Physical dimensions and styling settings
 * @param {function(Error|null): void} [callback] - Invoked upon completion or failure
 */
export function copySVG(pointsOrOptions, stats, climbs, blocks, waypoints, settings, callback) {
  const p = resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings, callback);
  const themeKey = THEMES[p.settings.theme] ? p.settings.theme : 'white';
  const { svg: svgMarkup } = renderActiveSticker(p, themeKey);

  const fallbackCopy = () => {
    let ta = null;
    try {
      ta = document.createElement('textarea');
      ta.value = svgMarkup;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      if (p.callback) p.callback(null);
    } catch (err) {
      if (p.callback) p.callback(err);
    } finally {
      if (ta && ta.parentNode) {
        ta.parentNode.removeChild(ta);
      }
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(svgMarkup).then(() => {
      if (p.callback) p.callback(null);
    }).catch(() => {
      fallbackCopy();
    });
  } else {
    fallbackCopy();
  }
}

/**
 * Renders the profile SVG onto an offscreen canvas at 300 DPI and downloads as a PNG.
 * Calculation: $px = \frac{\text{mm}}{25.4} \times 300\text{ DPI}$.
 *
 * @param {import('./signal.js').ProfilePoint[]|Object} pointsOrOptions - Profile coordinates or state options object
 * @param {import('./signal.js').RouteStats} [stats] - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} [settings={}] - Physical dimensions and styling settings
 * @param {function(Error|null): void} [callback] - Invoked upon completion or failure
 */
export function exportPNG(pointsOrOptions, stats, climbs, blocks, waypoints, settings, callback) {
  const p = resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings, callback);
  const themeKey = THEMES[p.settings.theme] ? p.settings.theme : 'white';
  const theme = THEMES[themeKey] || THEMES['white'];
  const { svg: svgMarkup, wMm, hMm, baseName } = renderActiveSticker(p, themeKey);
  const dpi = 300;
  const mmToIn = 1 / 25.4;
  const pxW = Math.round(wMm * mmToIn * dpi);
  const pxH = Math.round(hMm * mmToIn * dpi);

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = function() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const filename = baseName.toLowerCase().replace(/[^a-z0-9]/g, '_') +
        `_${wMm}x${hMm}mm_300dpi.png`;
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (p.callback) p.callback(null);
    } catch (err) {
      if (p.callback) p.callback(err);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = function(err) {
    URL.revokeObjectURL(url);
    if (p.callback) p.callback(err);
  };
  img.src = url;
}

/**
 * Exports the complete multi-sticker print sheet as an SVG file.
 *
 * @param {Object} state - Application store state
 * @param {Object} [printConfig={}] - Print configuration
 */
export function exportSheetSVG(state, printConfig = {}) {
  const result = generatePrintSheetMarkup(state, printConfig);
  const sheetW = 210; // A4 standard width in mm
  const sheetH = 297; // A4 standard height in mm

  // Wrap generated HTML/SVG inside a standalone foreignObject SVG
  const standaloneSvg = `
    <svg viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}mm" height="${sheetH}mm" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <foreignObject x="8" y="8" width="${sheetW - 16}" height="${sheetH - 16}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:-apple-system, BlinkMacSystemFont, sans-serif;">
          ${result.html}
        </div>
      </foreignObject>
    </svg>
  `.trim();

  const blob = new Blob([standaloneSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = (state.settings.title || 'stem_profile').toLowerCase().replace(/[^a-z0-9]/g, '_') +
    `_print_sheet_${result.count}x_${result.stickerW}x${result.stickerH}mm.svg`;

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Rasterizes the complete multi-sticker print sheet onto an offscreen canvas at 300 DPI.
 *
 * @param {Object} state - Application store state
 * @param {Object} [printConfig={}] - Print configuration
 * @param {function(Error|null): void} [callback] - Invoked upon completion
 */
export function exportSheetPNG(state, printConfig = {}, callback) {
  const result = generatePrintSheetMarkup(state, printConfig);
  const sheetW = 210;
  const sheetH = 297;
  const dpi = 300;
  const mmToIn = 1 / 25.4;
  const pxW = Math.round(sheetW * mmToIn * dpi);
  const pxH = Math.round(sheetH * mmToIn * dpi);

  const standaloneSvg = `
    <svg viewBox="0 0 ${sheetW} ${sheetH}" width="${sheetW}mm" height="${sheetH}mm" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <foreignObject x="8" y="8" width="${sheetW - 16}" height="${sheetH - 16}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:-apple-system, BlinkMacSystemFont, sans-serif;">
          ${result.html}
        </div>
      </foreignObject>
    </svg>
  `.trim();

  const blob = new Blob([standaloneSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.onload = function() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const filename = (state.settings.title || 'stem_profile').toLowerCase().replace(/[^a-z0-9]/g, '_') +
        `_print_sheet_${result.count}x_300dpi.png`;
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  img.onerror = function(err) {
    URL.revokeObjectURL(url);
    if (callback) callback(err);
  };
  img.src = url;
}
