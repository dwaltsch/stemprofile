/**
 * Export & Print Module
 *
 * Provides high-resolution export pipelines:
 * 1. Vector SVG File Download (`.svg`)
 * 2. High-Resolution Raster PNG Download at 300 DPI for vinyl label printers
 * 3. Clipboard Vector SVG Copy
 * 4. Print Sheet Matrix Generator for `@media print` layout
 *
 * @module export
 */

import { renderProfileSVG, THEMES } from './renderer.js';

/**
 * Normalizes polymorphic arguments (options object vs positional parameters) for export functions.
 *
 * @private
 */
function resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings, callback) {
  if (pointsOrOptions && typeof pointsOrOptions === 'object' && !Array.isArray(pointsOrOptions) && pointsOrOptions.points) {
    return {
      points: pointsOrOptions.points,
      stats: pointsOrOptions.stats || null,
      climbs: pointsOrOptions.climbs || [],
      blocks: pointsOrOptions.blocks || [],
      waypoints: pointsOrOptions.waypoints || [],
      settings: pointsOrOptions.settings || {},
      callback: typeof stats === 'function' ? stats : (pointsOrOptions.callback || null)
    };
  }

  // Handle legacy polymorphic signatures where waypoints was passed as settings
  let resolvedWaypoints = Array.isArray(waypoints) ? waypoints : [];
  let resolvedSettings = (typeof settings === 'object' && settings !== null && !Array.isArray(settings)) ? settings : {};
  let resolvedCallback = typeof callback === 'function' ? callback : null;

  if (!Array.isArray(waypoints) && typeof waypoints === 'object' && waypoints !== null) {
    resolvedSettings = waypoints;
    resolvedCallback = typeof settings === 'function' ? settings : null;
  } else if (typeof settings === 'function') {
    resolvedCallback = settings;
    resolvedSettings = {};
  }

  return {
    points: Array.isArray(pointsOrOptions) ? pointsOrOptions : [],
    stats: stats || null,
    climbs: climbs || [],
    blocks: blocks || [],
    waypoints: resolvedWaypoints,
    settings: resolvedSettings,
    callback: resolvedCallback
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
  const svgMarkup = renderProfileSVG({ ...p, settings: { ...p.settings, theme: themeKey }, isPrint: false });

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = (p.settings.title || 'stem_profile').toLowerCase().replace(/[^a-z0-9]/g, '_') +
    `_${p.settings.widthMm || 110}x${p.settings.heightMm || 35}mm.svg`;

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
  const svgMarkup = renderProfileSVG({ ...p, settings: { ...p.settings, theme: themeKey }, isPrint: false });

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
  const wMm = p.settings.widthMm || 110;
  const hMm = p.settings.heightMm || 35;
  const dpi = 300;
  const mmToIn = 1 / 25.4;
  const pxW = Math.round(wMm * mmToIn * dpi);
  const pxH = Math.round(hMm * mmToIn * dpi);

  const themeKey = THEMES[p.settings.theme] ? p.settings.theme : 'white';
  const theme = THEMES[themeKey] || THEMES['white'];

  const svgMarkup = renderProfileSVG({ ...p, settings: { ...p.settings, theme: themeKey }, isPrint: false });
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
      const filename = (p.settings.title || 'stem_profile').toLowerCase().replace(/[^a-z0-9]/g, '_') +
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
 * Builds the print sheet DOM matrix with multiple sticker copies and scissor guidelines.
 *
 * @param {import('./signal.js').ProfilePoint[]|Object} pointsOrOptions - Profile coordinates or state options object
 * @param {import('./signal.js').RouteStats} [stats] - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} [settings={}] - Physical dimensions and print copies settings
 */
export function updatePrintMatrix(pointsOrOptions, stats, climbs, blocks, waypoints, settings) {
  const p = resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings);
  const host = document.getElementById('print-matrix');
  if (!host) return;
  host.innerHTML = '';

  const count = parseInt(p.settings.printCopies, 10) || 2;
  const printSvg = renderProfileSVG({ ...p, settings: { ...p.settings, theme: 'white' }, isPrint: true });

  for (let i = 0; i < count; i++) {
    const cell = document.createElement('div');
    cell.className = 'print-cell';
    cell.innerHTML = `${printSvg}<div class="cut-line"></div>`;
    host.appendChild(cell);
  }
}
