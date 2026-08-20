/**
 * Export & Print Pipeline Module
 * - SVG File Download
 * - 300 DPI High-Resolution PNG Export (Offscreen Canvas)
 * - Clipboard SVG Copy
 * - Print Sheet Matrix Preparation (@media print)
 */

import { renderProfileSVG, THEME_PALETTES } from './renderer.js';

export function exportSVG(points, stats, settings) {
  const svgMarkup = renderProfileSVG(points, stats, settings, true);
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

export function copySVG(points, stats, settings, callback) {
  const svgMarkup = renderProfileSVG(points, stats, settings, true);
  navigator.clipboard.writeText(svgMarkup).then(() => {
    if (callback) callback(null);
  }).catch(err => {
    if (callback) callback(err);
  });
}

export function exportPNG(points, stats, settings, callback) {
  const wMm = settings.widthMm;
  const hMm = settings.heightMm;
  const dpi = 300;
  const mmToIn = 1 / 25.4;
  const pxW = Math.round(wMm * mmToIn * dpi);
  const pxH = Math.round(hMm * mmToIn * dpi);

  const svgMarkup = renderProfileSVG(points, stats, settings, true);
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d');
    const theme = THEME_PALETTES[settings.theme] || THEME_PALETTES['dark-cockpit'];
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

export function updatePrintMatrix(points, stats, settings) {
  const host = document.getElementById('print-matrix');
  if (!host) return;
  host.innerHTML = '';

  const count = parseInt(settings.printCopies, 10) || 2;
  const printTheme = settings.theme === 'high-contrast-light' ? 'high-contrast-light' : settings.theme;
  const printSvg = renderProfileSVG(points, stats, { ...settings, theme: printTheme }, true);

  for (let i = 0; i < count; i++) {
    const cell = document.createElement('div');
    cell.className = 'print-cell';
    cell.innerHTML = `${printSvg}<div class="cut-line"></div>`;
    host.appendChild(cell);
  }
}
