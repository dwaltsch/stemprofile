/**
 * Climb detail stickers: one zoomed-in roadbook card per categorized climb,
 * rendered at the same physical size as the elevation sticker.
 *
 * Each card shows the climb's own gradient blocks (auto-sized to ~8-20
 * segments), gradient % per segment, distance-to-summit labels, start and
 * summit elevation, and an estimated climbing time from the pacing model.
 *
 * @module renderer/climb-detail
 */

import { resolveTheme, getClimbCategoryColor } from './themes.js';
import { renderCutGuide } from './profile-layers.js';
import { escapeXml } from '../escape.js';
import { getInterpolatedEle } from '../signal.js';
import { buildSpatialBlocks } from '../signal/blocks.js';
import { getStatePacing } from '../fueling/pacing.js';
import { getUnitFactors, getUnitLabels } from '../units.js';
import { MAX_DETAIL_CLIMBS } from '../limits.js';

const BLOCK_SIZE_CANDIDATES_M = [100, 200, 250, 500, 1000, 2000];
const MAX_DETAIL_BLOCKS = 20;
const CARD_GAP_MM = 4;

/**
 * Climbs eligible for climb detail mode: enabled and not hidden on the profile.
 *
 * @param {Object} state - Store state
 * @returns {Array<Object>} Climbs in route order
 */
export function getEligibleDetailClimbs(state) {
  const hidden = new Set(((state.settings && state.settings.hiddenClimbIds) || []).map(String));
  return (state.climbs || []).filter(c => c && c.enabled !== false && !hidden.has(String(c.id)));
}

/**
 * Climbs shown in climb detail mode: the eligible climbs, at most MAX_DETAIL_CLIMBS
 * (a sawtooth route can have hundreds; a 7 m stack of stickers helps nobody).
 *
 * @param {Object} state - Store state
 * @returns {Array<Object>} Climbs in route order
 */
export function getDetailClimbs(state) {
  return getEligibleDetailClimbs(state).slice(0, MAX_DETAIL_CLIMBS);
}

/**
 * Picks the smallest segment length that keeps the climb at or below MAX_DETAIL_BLOCKS segments.
 *
 * @param {number} lengthM - Climb length in meters
 * @returns {number} Segment length in meters
 */
export function chooseDetailBlockSize(lengthM) {
  for (const size of BLOCK_SIZE_CANDIDATES_M) {
    if (lengthM / size <= MAX_DETAIL_BLOCKS) return size;
  }
  return BLOCK_SIZE_CANDIDATES_M[BLOCK_SIZE_CANDIDATES_M.length - 1];
}

/**
 * Segments a climb into gradient blocks measured from the climb start.
 *
 * @param {Array<Object>} points - Route profile points
 * @param {Object} climb - Detected climb
 * @returns {{ blocks: Array<Object>, blockSizeM: number, lengthM: number, startM: number }}
 */
export function buildClimbBlocks(points, climb) {
  const startM = climb.startKm * 1000;
  const lengthM = Math.max(1, (climb.summitKm - climb.startKm) * 1000);
  const blockSizeM = chooseDetailBlockSize(lengthM);
  // Re-base points onto the climb so block 1 starts at its foot; keep one neighbour each side for interpolation
  const local = points
    .filter((p, i) => p.dist >= startM - 1 && p.dist <= startM + lengthM + 1 ||
      (points[i + 1] && points[i + 1].dist > startM && p.dist < startM) ||
      (points[i - 1] && points[i - 1].dist < startM + lengthM && p.dist > startM + lengthM))
    .map(p => ({ ...p, dist: p.dist - startM }));
  return { blocks: buildSpatialBlocks(local, lengthM, blockSizeM), blockSizeM, lengthM, startM };
}

/** Name for a climb: the label of a summit waypoint near its top, else "Climb N". */
function climbName(climb, waypoints, index) {
  const summitM = climb.summitKm * 1000;
  const named = (waypoints || []).find(w => w && w.type === 'summit' && (w.label || '').trim() && Math.abs(w.distM - summitM) <= 800);
  return named ? named.label.trim() : `Climb ${index + 1}`;
}

/** Approximate rendered width of a string in mm at the given font size. */
function textWidth(str, fontSize, charRatio = 0.6) {
  return str.length * fontSize * charRatio;
}

/**
 * Renders the inner markup (no root <svg>) of one climb card at origin (0,0).
 *
 * @returns {{ markup: string, W: number, H: number, radius: number, theme: Object }}
 */
function renderClimbCardContent(state, climb, index, isPrint) {
  const settings = state.settings || {};
  const W = settings.widthMm || 110;
  const H = settings.heightMm || 35;
  const radius = settings.radiusMm || 0;
  const { theme } = resolveTheme(settings.theme, isPrint);
  const zoneColors = [theme.z1, theme.z2, theme.z3, theme.z4];
  const { dFactor, eFactor } = getUnitFactors(settings.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(settings.units);

  const { blocks, blockSizeM, lengthM, startM } = buildClimbBlocks(state.points, climb);

  // Geometry
  const padLeft = 7.5;
  const padRight = 4.5;
  const padTop = 8.6;
  const padBottom = 4.4;
  const plotW = W - padLeft - padRight;
  const yBase = H - padBottom;
  const plotH = yBase - padTop;

  const startEle = getInterpolatedEle(state.points, startM);
  const eles = blocks.flatMap(b => [b.startEle, b.endEle]).concat(startEle, climb.summitEle);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const span = Math.max(20, maxEle - minEle);
  const lowEle = minEle - span * 0.06;
  const highEle = maxEle + span * 0.04;
  const toX = d => padLeft + (d / lengthM) * plotW;
  const toY = e => yBase - ((e - lowEle) / (highEle - lowEle)) * plotH;

  // 1. Gradient block columns with in-column gradient %
  let columns = '';
  let dividers = '';
  let pctLabels = '';
  let topPath = '';
  blocks.forEach((b, idx) => {
    const x1 = toX(b.startDist);
    const x2 = toX(b.endDist);
    const y1 = toY(b.startEle);
    const y2 = toY(b.endEle);
    const bw = x2 - x1;
    topPath += idx === 0 ? `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)}` : ` L ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    columns += `<polygon points="${x1.toFixed(2)},${yBase.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)} ${x2.toFixed(2)},${yBase.toFixed(2)}" fill="${zoneColors[b.zone]}" stroke="${theme.blockStroke}" stroke-width="${bw >= 1.5 ? 0.15 : 0}"/>`;
    if (idx > 0) {
      dividers += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${yBase.toFixed(2)}" stroke="${theme.divider}" stroke-width="0.18"/>`;
    }
    if (bw >= 2.4) {
      const fontSize = Math.min(2.3, bw * 0.44);
      const pct = `${Math.round(b.grade)}${bw >= 4.6 ? '%' : ''}`;
      // Inside the column, clear of the sloped top edge (its lower corner); otherwise above its higher corner
      const lowerTopY = Math.max(y1, y2);
      const fitsInside = (yBase - lowerTopY) > fontSize + 1.4;
      const textY = fitsInside ? lowerTopY + fontSize + 0.45 : Math.min(y1, y2) - 0.6;
      // Amber (zone 2) needs dark text; other zone fills take white
      const fill = fitsInside ? (b.zone === 1 ? '#111827' : '#ffffff') : theme.text;
      pctLabels += `<text x="${((x1 + x2) / 2).toFixed(2)}" y="${textY.toFixed(2)}" fill="${fill}" font-size="${fontSize.toFixed(2)}" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${pct}</text>`;
    }
  });

  // 2. Distance-to-summit labels at block boundaries, skipping any that would overlap the previous one
  const decimals = blockSizeM < 1000 ? 1 : 0;
  const labelFont = 1.85;
  let distLabels = '';
  let lastRightX = -Infinity;
  for (let k = 0; k * blockSizeM < lengthM - blockSizeM * 0.5; k++) {
    const d = k * blockSizeM;
    const x = toX(d);
    const toGo = ((lengthM - d) * dFactor).toFixed(decimals);
    const label = k === 0 ? `${toGo} ${distUnit}` : toGo;
    const w = textWidth(label, labelFont, 0.55);
    const left = k === 0 ? x : x - w / 2;
    if (left < lastRightX + 1.2) continue;
    lastRightX = left + w;
    distLabels += `<text x="${x.toFixed(2)}" y="${(yBase + 2.6).toFixed(2)}" fill="${theme.textMuted}" font-size="${labelFont}" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="${k === 0 ? 'start' : 'middle'}">${label}</text>`;
  }

  // 3. Start & summit elevation
  const summitX = toX(lengthM);
  const summitY = toY(climb.summitEle);
  const eleLabels = `
    <text x="${(padLeft - 0.8).toFixed(2)}" y="${(toY(startEle) + 0.7).toFixed(2)}" fill="${theme.textMuted}" font-size="1.8" font-weight="800" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${Math.round(startEle * eFactor)}</text>
    <polygon points="${summitX.toFixed(2)},${(summitY - 1.6).toFixed(2)} ${(summitX + 1.1).toFixed(2)},${(summitY + 0.3).toFixed(2)} ${(summitX - 1.1).toFixed(2)},${(summitY + 0.3).toFixed(2)}" fill="${theme.topStroke}"/>
    <text x="${(summitX - 1.6).toFixed(2)}" y="${(summitY - 0.4).toFixed(2)}" fill="${theme.text}" font-size="2.0" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="end">${Math.round(climb.summitEle * eFactor)} ${eleUnit}</text>
  `;

  // 4. Header: category pill, climb name + route km, stats (pieces dropped right-to-left to fit)
  const catColor = getClimbCategoryColor(climb.category, theme);
  const catStr = (climb.category || 'Climb').toUpperCase();
  const catW = Math.max(7, textWidth(catStr, 2.2, 0.68) + 2.4);
  const nameX = 1.8 + catW + 1.4;
  const name = climbName(climb, state.waypoints, index);
  const routeKm = `km ${(climb.startKm * 1000 * dFactor).toFixed(1)}`;

  let minutes = null;
  if (state.points && state.points.length >= 2 && state.fueling) {
    const pacing = getStatePacing(state);
    minutes = Math.round((pacing.timeAt(startM + lengthM) - pacing.timeAt(startM)) / 60);
  }
  const statPieces = [
    { text: `${(lengthM * dFactor).toFixed(1)} ${distUnit}`, fill: theme.text },
    { text: `${climb.avgGrade}%`, fill: theme.text },
    { text: `+${Math.round(climb.gainM * eFactor)} ${eleUnit}`, fill: theme.z1 },
    { text: `max ${climb.maxGrade}%`, fill: theme.z4 },
    minutes !== null ? { text: `~${minutes} min`, fill: theme.textMuted } : null
  ].filter(Boolean);
  const nameW = textWidth(name, 2.5, 0.58);
  const routeKmW = textWidth(routeKm, 1.7);
  const statsAvail = () => W - padRight - (nameX + nameW + routeKmW + 2.5);
  const statsWidth = pieces => textWidth(pieces.map(p => p.text).join(' · '), 1.95);
  while (statPieces.length > 2 && statsWidth(statPieces) > statsAvail()) statPieces.pop();
  const statsMarkup = statPieces
    .map((p, i) => `${i > 0 ? `<tspan fill="${theme.textMuted}"> · </tspan>` : ''}<tspan fill="${p.fill}">${escapeXml(p.text)}</tspan>`)
    .join('');

  const header = `
    <rect x="1.8" y="1.3" width="${catW.toFixed(2)}" height="3.7" rx="0.8" fill="${catColor}"/>
    <text x="${(1.8 + catW / 2).toFixed(2)}" y="4.0" fill="#ffffff" font-size="2.2" font-weight="900" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">${escapeXml(catStr)}</text>
    <text x="${nameX.toFixed(2)}" y="4.1" fill="${theme.text}" font-size="2.5" font-weight="800" font-family="system-ui, -apple-system, sans-serif">${escapeXml(name)}<tspan fill="${theme.textMuted}" font-size="1.7" font-weight="700" dx="1.2">${escapeXml(routeKm)}</tspan></text>
    <text x="${(W - padRight).toFixed(2)}" y="4.1" font-size="1.95" font-weight="800" font-family="monospace" text-anchor="end">${statsMarkup}</text>
    <line x1="1.8" y1="6.3" x2="${(W - padRight).toFixed(2)}" y2="6.3" stroke="${theme.grid}" stroke-width="0.3"/>
  `;

  const markup = `
    <rect width="${W}" height="${H}" rx="${radius}" fill="${theme.bg}"/>
    ${header}
    ${columns}
    ${dividers}
    <path d="${topPath}" fill="none" stroke="${theme.topStroke}" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round"/>
    ${pctLabels}
    ${distLabels}
    ${eleLabels}
    ${renderCutGuide({ settings, theme, W, H, radius })}
  `;
  return { markup, W, H, radius, theme };
}

/**
 * Renders one climb detail sticker as a standalone SVG.
 *
 * @param {Object} state - Store state ({ points, climbs, waypoints, settings, fueling })
 * @param {Object} climb - Climb to render
 * @param {Object} [options]
 * @param {number} [options.index=0] - Climb position, used for the fallback name
 * @param {boolean} [options.isPrint=false] - Force ink-saver white theme
 * @returns {string} SVG markup
 */
export function renderClimbDetailSVG(state, climb, { index = 0, isPrint = false } = {}) {
  const { markup, W, H, radius, theme } = renderClimbCardContent(state, climb, index, isPrint);
  return `<svg class="climb-detail-svg" data-climb-id="${escapeXml(climb.id)}" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm" xmlns="http://www.w3.org/2000/svg" style="display:block; border-radius:${radius}mm; background:${theme.bg};">${markup}</svg>`;
}

/**
 * Renders all detail climbs stacked vertically into a single SVG (for file export).
 *
 * @param {Object} state - Store state
 * @param {Object} [options]
 * @param {boolean} [options.isPrint=false] - Force ink-saver white theme
 * @returns {{ svg: string, widthMm: number, heightMm: number, count: number }}
 */
export function renderClimbDetailStackSVG(state, { isPrint = false } = {}) {
  const climbs = getDetailClimbs(state);
  const W = (state.settings && state.settings.widthMm) || 110;
  const H = (state.settings && state.settings.heightMm) || 35;
  const totalH = climbs.length > 0 ? climbs.length * H + (climbs.length - 1) * CARD_GAP_MM : H;
  const cards = climbs.map((climb, i) => {
    const { markup } = renderClimbCardContent(state, climb, i, isPrint);
    return `<g class="climb-detail-card" data-climb-id="${escapeXml(climb.id)}" transform="translate(0, ${(i * (H + CARD_GAP_MM)).toFixed(2)})">${markup}</g>`;
  }).join('');
  return {
    svg: `<svg class="climb-detail-stack" viewBox="0 0 ${W} ${totalH}" width="${W}mm" height="${totalH}mm" xmlns="http://www.w3.org/2000/svg">${cards}</svg>`,
    widthMm: W,
    heightMm: totalH,
    count: climbs.length
  };
}
