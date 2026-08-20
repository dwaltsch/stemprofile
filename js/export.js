/**
 * Export & Print Module
 */

import { renderProfileSVG, THEMES } from './renderer.js';

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
