/**
 * Multi-sticker print sheet layout: crop marks, calibration ruler, sheet markup and the @media print matrix.
 *
 * @module export/print-sheet
 */

import { DEFAULT_PRINT_CONFIG, resolveExportParams } from './config.js';
import { escapeHtml } from '../escape.js';
import { getUnitFactors, getUnitLabels } from '../units.js';
import { renderFuelingSVG } from '../fueling-renderer.js';
import { renderProfileSVG } from '../renderer.js';

/**
 * Generates vector L-shaped corner crop marks and center registration ticks for a sticker cell.
 * Allows razor/straightedge trimming without leaving ink markings on the finished sticker.
 *
 * @param {number} W - Sticker width in mm
 * @param {number} H - Sticker height in mm
 * @param {number} [offset=2.5] - Margin offset in mm
 * @param {number} [armLen=4] - Tick length in mm
 * @returns {string} SVG markup for crop marks
 */
export function generateCropMarksSVG(W, H, offset = 2.5, armLen = 4) {
  const stroke = '#222222';
  const strokeWidth = '0.25';
  const gap = 1.0; // gap from sticker corner

  // Top-left
  const tlV = `<line x1="${offset}" y1="${offset - gap}" x2="${offset}" y2="${offset - gap - armLen}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const tlH = `<line x1="${offset - gap}" y1="${offset}" x2="${offset - gap - armLen}" y2="${offset}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

  // Top-right
  const trV = `<line x1="${offset + W}" y1="${offset - gap}" x2="${offset + W}" y2="${offset - gap - armLen}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const trH = `<line x1="${offset + W + gap}" y1="${offset}" x2="${offset + W + gap + armLen}" y2="${offset}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

  // Bottom-left
  const blV = `<line x1="${offset}" y1="${offset + H + gap}" x2="${offset}" y2="${offset + H + gap + armLen}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const blH = `<line x1="${offset - gap}" y1="${offset + H}" x2="${offset - gap - armLen}" y2="${offset + H}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

  // Bottom-right
  const brV = `<line x1="${offset + W}" y1="${offset + H + gap}" x2="${offset + W}" y2="${offset + H + gap + armLen}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  const brH = `<line x1="${offset + W + gap}" y1="${offset + H}" x2="${offset + W + gap + armLen}" y2="${offset + H}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

  // Center registration ticks
  const midX = offset + W / 2;
  const midY = offset + H / 2;
  const tc = `<line x1="${midX}" y1="${offset - gap}" x2="${midX}" y2="${offset - gap - (armLen * 0.75)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="1,1"/>`;
  const bc = `<line x1="${midX}" y1="${offset + H + gap}" x2="${midX}" y2="${offset + H + gap + (armLen * 0.75)}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="1,1"/>`;
  const lc = `<line x1="${offset - gap}" y1="${midY}" x2="${offset - gap - (armLen * 0.75)}" y2="${midY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="1,1"/>`;
  const rc = `<line x1="${offset + W + gap}" y1="${midY}" x2="${offset + W + gap + (armLen * 0.75)}" y2="${midY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="1,1"/>`;

  return `
    <g class="crop-marks" pointer-events="none">
      ${tlV}${tlH}
      ${trV}${trH}
      ${blV}${blH}
      ${brV}${brH}
      ${tc}${bc}${lc}${rc}
    </g>
  `.trim();
}

/**
 * Generates an SVG 50mm and 2-inch calibration check ruler for print scale verification.
 * Users can place a physical ruler on the printout to guarantee 100% (1:1) scale.
 *
 * @param {number} [widthMm=120] - Total container width in mm
 * @returns {string} SVG markup for calibration ruler
 */
export function generateCalibrationRulerSVG(widthMm = 140) {
  const rulerW = Math.max(110, widthMm);
  const rulerH = 9;

  let metricTicks = '';
  for (let i = 0; i <= 50; i++) {
    const x = 5 + i;
    let tickH = 1.2;
    let label = '';
    if (i % 10 === 0) {
      tickH = 3.2;
      label = `<text x="${x}" y="7.8" font-size="1.8" font-weight="700" font-family="monospace" text-anchor="middle" fill="#0f172a">${i}</text>`;
    } else if (i % 5 === 0) {
      tickH = 2.2;
    }
    metricTicks += `<line x1="${x}" y1="4.0" x2="${x}" y2="${4.0 - tickH}" stroke="#0f172a" stroke-width="0.25"/>${label}`;
  }

  // Imperial 2-inch bar (50.8mm)
  let imperialTicks = '';
  const impStartX = 62;
  const inToMm = 25.4;
  for (let i = 0; i <= 16; i++) {
    const x = impStartX + (i * inToMm / 8); // eighths of an inch
    if (x > rulerW - 5) break;
    let tickH = 1.2;
    let label = '';
    if (i % 8 === 0) {
      const inVal = i / 8;
      tickH = 3.2;
      label = `<text x="${x.toFixed(2)}" y="7.8" font-size="1.8" font-weight="700" font-family="monospace" text-anchor="middle" fill="#0f172a">${inVal}"</text>`;
    } else if (i % 4 === 0) {
      tickH = 2.2;
    }
    imperialTicks += `<line x1="${x.toFixed(2)}" y1="4.0" x2="${x.toFixed(2)}" y2="${(4.0 - tickH).toFixed(2)}" stroke="#0f172a" stroke-width="0.25"/>${label}`;
  }

  return `
    <svg class="print-calibration-bar" viewBox="0 0 ${rulerW} ${rulerH}" width="${rulerW}mm" height="${rulerH}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; margin: 0 auto;">
      <rect x="0" y="0" width="${rulerW}" height="${rulerH}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.3" rx="1"/>
      <!-- Metric Bar -->
      <line x1="5" y1="4.0" x2="55" y2="4.0" stroke="#0f172a" stroke-width="0.3"/>
      ${metricTicks}
      <text x="30" y="2.2" font-size="1.5" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="#475569">50 mm Metric Scale</text>
      <!-- Imperial Bar -->
      <line x1="${impStartX}" y1="4.0" x2="${impStartX + 50.8}" y2="4.0" stroke="#0f172a" stroke-width="0.3"/>
      ${imperialTicks}
      <text x="${impStartX + 25.4}" y="2.2" font-size="1.5" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="#475569">2.0 in Imperial Scale</text>
      <!-- Verification text -->
      <text x="${rulerW - 3}" y="4.8" font-size="1.4" font-weight="600" font-family="sans-serif" text-anchor="end" fill="#64748b">100% Physical Size Check</text>
    </svg>
  `.trim();
}

/**
 * Builds complete print sheet DOM & SVG markup with precision crop marks,
 * calibration ruler, header metadata, and multiple sticker cells.
 *
 * @param {Object} pointsOrOptions - Route points or state object
 * @param {Object} [printOpts={}] - Print options overrides
 * @returns {{ html: string, count: number, widthMm: number, heightMm: number, stickerW: number, stickerH: number }} Generated markup & geometry
 */
export function generatePrintSheetMarkup(pointsOrOptions, stats, climbs, blocks, waypoints, settings, printOpts = {}) {
  // Support polymorphic options
  let p;
  let popts = printOpts;
  if (pointsOrOptions && typeof pointsOrOptions === 'object' && !Array.isArray(pointsOrOptions) && pointsOrOptions.points) {
    p = resolveExportParams(pointsOrOptions);
    popts = stats && typeof stats === 'object' && !stats.totalDist ? stats : printOpts;
  } else {
    p = resolveExportParams(pointsOrOptions, stats, climbs, blocks, waypoints, settings);
  }

  const cfg = {
    ...DEFAULT_PRINT_CONFIG,
    copies: parseInt(p.settings.printCopies, 10) || DEFAULT_PRINT_CONFIG.copies,
    ...popts
  };

  const count = Math.max(1, parseInt(cfg.copies, 10) || 1);
  const stickerType = cfg.stickerType || 'active';
  const isSheetFueling = (stickerType === 'fueling') ||
    ((stickerType === 'active' || !stickerType) && p.activeView === 'fueling');
  const W = isSheetFueling ? (p.settings.fuelingWidthMm || 35) : (p.settings.widthMm || 110);
  const H = isSheetFueling ? (p.settings.fuelingHeightMm || 115) : (p.settings.heightMm || 35);
  const radius = p.settings.radiusMm || 0;
  const cropOffset = 3.5; // mm margin around sticker for crop marks

  // Determine theme: if printTheme === 'white', force high contrast ink-saver white
  const isPrintWhite = cfg.printTheme === 'white';
  const effectiveTheme = isPrintWhite ? 'white' : (p.settings.theme || 'white');

  // Format header telemetry
  const { dFactor, eFactor } = getUnitFactors(p.settings.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(p.settings.units);
  const totalDistU = p.stats ? (p.stats.totalDist * dFactor).toFixed(1) : '0.0';
  const elevGainU = p.stats ? Math.round(p.stats.elevGain * eFactor) : 0;
  const maxGrade = p.stats ? p.stats.maxGrade.toFixed(1) : '0.0';
  const title = p.settings.title || 'StemProfile Elevation Sticker';

  // Render individual sticker SVG
  const renderCellSvg = (cellIndex) => {
    let isFuel = false;
    if (stickerType === 'fueling') {
      isFuel = true;
    } else if (stickerType === 'elevation') {
      isFuel = false;
    } else if (stickerType === 'both') {
      isFuel = (cellIndex % 2 === 1);
    } else {
      isFuel = (p.activeView === 'fueling');
    }

    if (isFuel) {
      return renderFuelingSVG({
        ...p,
        settings: { ...p.settings, theme: effectiveTheme }
      }, { isPrint: isPrintWhite });
    }
    return renderProfileSVG({
      ...p,
      settings: { ...p.settings, theme: effectiveTheme },
      isPrint: isPrintWhite
    });
  };

  // Crop marks SVG for one cell
  const cropMarksSvg = cfg.showCropMarks ? generateCropMarksSVG(W, H, cropOffset, 3.5) : '';

  // Generate cells
  let cellsHtml = '';
  const cellW = W + (cropOffset * 2);
  const cellH = H + (cropOffset * 2);

  for (let i = 0; i < count; i++) {
    const singleSvg = renderCellSvg(i);

    // Unique scoped gradient ID per cell to prevent collision
    const scopedSvg = singleSvg
      .replace(/id="climb-active-grad"/g, `id="climb-active-grad-sheet-${i}"`)
      .replace(/url\(#climb-active-grad\)/g, `url(#climb-active-grad-sheet-${i})`)
      .replace(/id="profile-svg-elem"/g, `id="profile-svg-elem-sheet-${i}"`)
      .replace(/id="fueling-svg-elem"/g, `id="fueling-svg-elem-sheet-${i}"`);

    const cutOutline = cfg.showCutLines
      ? `<div class="print-cell-cut-guide" style="position:absolute; left:${cropOffset}mm; top:${cropOffset}mm; width:${W}mm; height:${H}mm; border-radius:${radius}mm; border:0.35pt dashed #94a3b8; pointer-events:none;"></div>`
      : '';

    cellsHtml += `
      <div class="print-sheet-cell" style="position:relative; width:${cellW}mm; height:${cellH}mm; margin:1mm; page-break-inside:avoid; break-inside:avoid;">
        ${cfg.showCropMarks ? `
          <svg viewBox="0 0 ${cellW} ${cellH}" width="${cellW}mm" height="${cellH}mm" style="position:absolute; left:0; top:0; pointer-events:none; z-index:2;">
            ${cropMarksSvg}
          </svg>
        ` : ''}
        <div style="position:absolute; left:${cropOffset}mm; top:${cropOffset}mm; width:${W}mm; height:${H}mm;">
          ${scopedSvg}
        </div>
        ${cutOutline}
      </div>
    `;
  }

  // Header HTML
  const headerHtml = cfg.showHeader ? `
    <div class="print-sheet-meta-header" style="width:100%; border-bottom: 0.5pt solid #cbd5e1; padding-bottom: 2mm; margin-bottom: 3mm; display:flex; justify-content:space-between; align-items:flex-end; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size:7pt; color:#334155;">
      <div>
        <strong style="font-size:8.5pt; color:#0f172a;">${escapeHtml(title)}</strong>
        <span style="margin-left: 3mm; color:#64748b;">${totalDistU} ${distUnit} · +${elevGainU} ${eleUnit} · Max ${maxGrade}%</span>
      </div>
      <div style="text-align:right;">
        <span style="font-weight:600; color:#0f172a;">${W} × ${H} mm (r=${radius}mm)</span>
        <span style="margin-left: 2mm; padding: 0.5mm 1.5mm; background:#f1f5f9; border-radius:1mm; font-weight:700; color:#2563eb;">100% Actual Scale</span>
      </div>
    </div>
  ` : '';

  // Calibration Ruler HTML
  const rulerHtml = cfg.showRuler ? `
    <div class="print-sheet-ruler-wrap" style="width:100%; margin-top:3mm; padding-top:2mm; border-top: 0.5pt solid #cbd5e1; display:flex; justify-content:center;">
      ${generateCalibrationRulerSVG(Math.max(120, cellW))}
    </div>
  ` : '';

  // Instructions footer
  const instructionsHtml = `
    <div class="print-sheet-footer-note" style="margin-top:2mm; font-size:6pt; color:#94a3b8; text-align:center; font-family:sans-serif;">
      Print Calibration: Set <strong>Scale: 100% (Actual Size)</strong> · Disable "Fit to page" · Check "Background graphics"
    </div>
  `;

  const fullHtml = `
    <div class="print-sheet-wrapper" style="box-sizing:border-box; width:100%; display:flex; flex-direction:column; align-items:center; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
      ${headerHtml}
      <div class="print-sheet-grid" style="display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:2mm; width:100%;">
        ${cellsHtml}
      </div>
      ${rulerHtml}
      ${instructionsHtml}
    </div>
  `.trim();

  return {
    html: fullHtml,
    count,
    widthMm: cellW,
    heightMm: cellH,
    stickerW: W,
    stickerH: H
  };
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
 * @param {Object} [printOptions={}] - Optional print sheet configuration
 */
export function updatePrintMatrix(pointsOrOptions, stats, climbs, blocks, waypoints, settings, printOptions = {}) {
  const host = document.getElementById('print-matrix');
  if (!host) return;

  const result = generatePrintSheetMarkup(pointsOrOptions, stats, climbs, blocks, waypoints, settings, printOptions);
  host.innerHTML = result.html;
}
