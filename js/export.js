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
 * Exports and downloads the generated profile as a vector `.svg` file.
 *
 * @param {import('./signal.js').ProfilePoint[]} points - Profile coordinates
 * @param {import('./signal.js').RouteStats} stats - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} settings - Physical dimensions and styling settings
 */
export function exportSVG(points, stats, climbs, blocks, waypoints, settings) {
  if (!Array.isArray(waypoints) && typeof waypoints === 'object') {
    settings = waypoints;
    waypoints = [];
  }
  const themeKey = settings.theme === 'dark' ? 'dark' : 'white';
  const svgMarkup = renderProfileSVG(points, stats, climbs, blocks, waypoints, { ...settings, theme: themeKey }, false);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = (settings.title || 'stem_profile').toLowerCase().replace(/[^a-z0-9]/g, '_') + `_${settings.widthMm}x${settings.heightMm}mm.svg`;
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
 * @param {import('./signal.js').ProfilePoint[]} points - Profile coordinates
 * @param {import('./signal.js').RouteStats} stats - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} settings - Physical dimensions and styling settings
 * @param {function(Error|null): void} [callback] - Invoked upon completion or failure
 */
export function copySVG(points, stats, climbs, blocks, waypoints, settings, callback) {
  if (!Array.isArray(waypoints) && typeof waypoints === 'object') {
    callback = settings;
    settings = waypoints;
    waypoints = [];
  }
  const themeKey = settings.theme === 'dark' ? 'dark' : 'white';
  const svgMarkup = renderProfileSVG(points, stats, climbs, blocks, waypoints, { ...settings, theme: themeKey }, false);
  navigator.clipboard.writeText(svgMarkup).then(() => {
    if (callback) callback(null);
  }).catch(err => {
    if (callback) callback(err);
  });
}

/**
 * Renders the profile SVG onto an offscreen canvas at 300 DPI and downloads as a PNG.
 * Calculation: $px = \frac{\text{mm}}{25.4} \times 300\text{ DPI}$.
 *
 * @param {import('./signal.js').ProfilePoint[]} points - Profile coordinates
 * @param {import('./signal.js').RouteStats} stats - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} settings - Physical dimensions and styling settings
 * @param {function(Error|null): void} [callback] - Invoked upon completion or failure
 */
export function exportPNG(points, stats, climbs, blocks, waypoints, settings, callback) {
  if (!Array.isArray(waypoints) && typeof waypoints === 'object') {
    callback = settings;
    settings = waypoints;
    waypoints = [];
  }
  const wMm = settings.widthMm;
  const hMm = settings.heightMm;
  const dpi = 300;
  const mmToIn = 1 / 25.4;
  const pxW = Math.round(wMm * mmToIn * dpi);
  const pxH = Math.round(hMm * mmToIn * dpi);

  const themeKey = settings.theme === 'dark' ? 'dark' : 'white';
  const theme = THEMES[themeKey] || THEMES['white'];

  const svgMarkup = renderProfileSVG(points, stats, climbs, blocks, waypoints, { ...settings, theme: themeKey }, false);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const filename = (settings.title || 'stem_profile').toLowerCase().replace(/[^a-z0-9]/g, '_') + `_${wMm}x${hMm}mm_300dpi.png`;
    a.href = pngUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (callback) callback(null);
  };
  img.onerror = function(err) {
    if (callback) callback(err);
  };
  img.src = url;
}

/**
 * Builds the print sheet DOM matrix with multiple sticker copies and scissor guidelines.
 *
 * @param {import('./signal.js').ProfilePoint[]} points - Profile coordinates
 * @param {import('./signal.js').RouteStats} stats - Route telemetry
 * @param {import('./signal.js').DetectedClimb[]} [climbs=[]] - Detected climbs
 * @param {import('./signal.js').SpatialBlock[]} [blocks=[]] - Discretized blocks
 * @param {Array<Object>} [waypoints=[]] - Active waypoints
 * @param {Object} settings - Physical dimensions and print copies settings
 */
export function updatePrintMatrix(points, stats, climbs, blocks, waypoints, settings) {
  if (!Array.isArray(waypoints) && typeof waypoints === 'object') {
    settings = waypoints;
    waypoints = [];
  }
  const host = document.getElementById('print-matrix');
  if (!host) return;
  host.innerHTML = '';

  const count = parseInt(settings.printCopies, 10) || 2;
  const printSvg = renderProfileSVG(points, stats, climbs, blocks, waypoints, { ...settings, theme: 'white' }, true);

  for (let i = 0; i < count; i++) {
    const cell = document.createElement('div');
    cell.className = 'print-cell';
    cell.innerHTML = `${printSvg}<div class="cut-line"></div>`;
    host.appendChild(cell);
  }
}

