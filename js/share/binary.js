/**
 * Packed binary share protocol (version 4): serializes and deserializes app state to a Uint8Array.
 *
 * Layout: version, title, profile curve, settings, hidden climbs, waypoints, fuel plan.
 *
 * @module share/binary
 */

import { DEFAULT_SETTINGS, THEME_INDEX, THEME_NAMES, WPT_TYPE_INDEX, WPT_TYPE_NAMES, SHARE_PROTOCOL_VERSION, FUEL_TYPE_NAMES, FUEL_DEFAULT_KEYS } from './constants.js';
import { simplifyProfileCurve } from './simplify.js';

/** Largest distance the format can express (3-byte total distance field). */
const MAX_DISTANCE_M = 0xffffff;
/** Most fuel items a link carries. */
const MAX_LINK_FUEL_ITEMS = 200;
const MAX_FUEL_NAME_BYTES = 50;
const MAX_FUEL_NOTE_BYTES = 120;

// Fuel section flag bits
const FUEL_FLAG_ITEMS = 1;     // the item list follows
const FUEL_FLAG_CUSTOMIZED = 8; // the plan was edited by hand
const FUEL_FLAG_CONSTANT = 2;  // constant-speed pacing instead of terrain-aware
const FUEL_FLAG_TIME = 4;      // cue sheet shows elapsed time instead of km

// Fuel item flag bits
const ITEM_FLAG_ENABLED = 1;
const ITEM_FLAG_AID = 2;
const ITEM_FLAG_NOTES = 4;

/**
 * Safely extracts a subarray slice from a byte buffer without overflowing bounds.
 *
 * @param {Uint8Array} bytes - Source byte buffer
 * @param {number} offset - Start offset
 * @param {number} length - Desired length
 * @returns {Uint8Array} Subarray slice
 */
export function safeReadSlice(bytes, offset, length) {
  if (!bytes || offset >= bytes.length) return new Uint8Array(0);
  const start = Math.max(0, offset);
  const end = Math.min(bytes.length, start + Math.max(0, length));
  return bytes.subarray(start, end);
}

function writeVarint(buf, n) {
  let v = (n << 1) ^ (n >> 31);
  while (v >= 0x80) {
    buf.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  buf.push(v & 0x7f);
}

function writeText(buf, encoder, str, maxBytes) {
  let bytes = encoder.encode(str || '');
  if (bytes.length > maxBytes) {
    // Cut on a character boundary so the label stays valid UTF-8
    let cut = maxBytes;
    while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--;
    bytes = bytes.subarray(0, cut);
  }
  buf.push(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf.push(bytes[i]);
}

function readText(bytes, offsetObj, decoder) {
  if (offsetObj.offset >= bytes.length) throw new RangeError('truncated');
  const len = bytes[offsetObj.offset++];
  if (offsetObj.offset + len > bytes.length) throw new RangeError('truncated');
  const str = decoder.decode(safeReadSlice(bytes, offsetObj.offset, len));
  offsetObj.offset += len;
  return str;
}

function readByte(bytes, offsetObj) {
  if (offsetObj.offset >= bytes.length) throw new RangeError('truncated');
  return bytes[offsetObj.offset++];
}

/**
 * Appends the fuel plan: pacing / target settings, product defaults and the
 * items. Items are always sent: the receiver only has the simplified profile,
 * so a plan regenerated there would put cues at slightly different places.
 */
function writeFueling(buf, encoder, fueling) {
  const f = fueling && typeof fueling === 'object' ? fueling : {};
  const items = Array.isArray(f.items) ? f.items.slice(0, MAX_LINK_FUEL_ITEMS) : [];
  const withItems = items.length > 0;
  buf.push((withItems ? FUEL_FLAG_ITEMS : 0) |
    (f.customized === true ? FUEL_FLAG_CUSTOMIZED : 0) |
    (f.pacingMode === 'constant' ? FUEL_FLAG_CONSTANT : 0) |
    (f.mode === 'time' ? FUEL_FLAG_TIME : 0));
  writeVarint(buf, Math.round(f.targetCarbsPerHour || 75));
  writeVarint(buf, Math.round((f.avgSpeedKmh || 25) * 10));
  writeVarint(buf, Math.round(f.aidStationStopMin || 0));
  const defs = f.productDefaults || {};
  for (const key of FUEL_DEFAULT_KEYS) writeVarint(buf, Math.round(Number(defs[key]) || 0));
  if (!withItems) return;

  writeVarint(buf, items.length);
  let prevDam = 0;
  for (const it of items) {
    const dam = Math.max(prevDam, Math.round((it.distM || 0) / 10));
    writeVarint(buf, dam - prevDam);
    prevDam = dam;
    const typeIdx = FUEL_TYPE_NAMES.indexOf(it.type);
    buf.push(typeIdx >= 0 ? typeIdx : 0);
    const notes = typeof it.notes === 'string' ? it.notes : '';
    buf.push((it.enabled !== false ? ITEM_FLAG_ENABLED : 0) |
      (it.isAidStation === true ? ITEM_FLAG_AID : 0) |
      (notes ? ITEM_FLAG_NOTES : 0));
    writeVarint(buf, Math.round(it.carbsG || 0));
    writeVarint(buf, Math.round(it.fluidMl || 0));
    writeText(buf, encoder, it.name, MAX_FUEL_NAME_BYTES);
    if (notes) writeText(buf, encoder, notes, MAX_FUEL_NOTE_BYTES);
  }
}

/** Reads the fuel section; values are clamped later by the fueling sanitizer. */
function readFueling(bytes, offsetObj, decoder) {
  const flags = readByte(bytes, offsetObj);
  const fueling = {
    pacingMode: (flags & FUEL_FLAG_CONSTANT) ? 'constant' : 'terrain',
    mode: (flags & FUEL_FLAG_TIME) ? 'time' : 'km',
    targetCarbsPerHour: readVarint(bytes, offsetObj),
    avgSpeedKmh: readVarint(bytes, offsetObj) / 10,
    aidStationStopMin: readVarint(bytes, offsetObj),
    productDefaults: {},
    customized: Boolean(flags & FUEL_FLAG_CUSTOMIZED),
    items: []
  };
  for (const key of FUEL_DEFAULT_KEYS) fueling.productDefaults[key] = readVarint(bytes, offsetObj);
  if (!(flags & FUEL_FLAG_ITEMS)) return fueling;

  const n = readVarint(bytes, offsetObj);
  if (n < 0 || n > MAX_LINK_FUEL_ITEMS) throw new RangeError('too many fuel items');
  let dam = 0;
  for (let i = 0; i < n; i++) {
    const step = readVarint(bytes, offsetObj);
    if (step < 0) throw new RangeError('fuel items out of order');
    dam += step;
    const type = FUEL_TYPE_NAMES[readByte(bytes, offsetObj)] || 'gel';
    const itemFlags = readByte(bytes, offsetObj);
    const carbsG = readVarint(bytes, offsetObj);
    const fluidMl = readVarint(bytes, offsetObj);
    const name = readText(bytes, offsetObj, decoder);
    const notes = (itemFlags & ITEM_FLAG_NOTES) ? readText(bytes, offsetObj, decoder) : '';
    fueling.items.push({
      distM: dam * 10,
      type,
      name,
      notes,
      carbsG,
      fluidMl,
      isAidStation: Boolean(itemFlags & ITEM_FLAG_AID),
      enabled: Boolean(itemFlags & ITEM_FLAG_ENABLED)
    });
  }
  return fueling;
}

function readVarint(bytes, offsetObj) {
  let result = 0;
  let shift = 0;
  let iterations = 0;
  while (true) {
    if (offsetObj.offset >= bytes.length || iterations > 5) break;
    const b = bytes[offsetObj.offset++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
    iterations++;
  }
  return (result >>> 1) ^ -(result & 1);
}

/**
 * Serializes active application state into a packed binary Uint8Array (Protocol v3).
 *
 * @param {Object} appState - Global application state
 * @returns {Uint8Array} Packed binary buffer
 */
export function serializeBinaryState(appState) {
  const buf = [];
  buf.push(SHARE_PROTOCOL_VERSION);

  // 1. Title UTF-8
  const titleStr = (appState.settings && appState.settings.title) || appState.title || '';
  const titleEncoder = new TextEncoder();
  writeText(buf, titleEncoder, titleStr.slice(0, 120), 255);

  // 2. Profile Curve (Adaptive Douglas-Peucker)
  let rawPoints = [];
  if (appState.points && appState.points.length >= 2) {
    rawPoints = appState.points;
  } else if (appState.rawCoords && appState.rawCoords.length >= 2) {
    let d = 0;
    rawPoints.push({ dist: 0, ele: appState.rawCoords[0].ele || appState.rawCoords[0][2] || 0 });
    for (let i = 1; i < appState.rawCoords.length; i++) {
      const c1 = appState.rawCoords[i - 1];
      const c2 = appState.rawCoords[i];
      const lat1 = c1.lat || c1[0] || 0, lon1 = c1.lon || c1[1] || 0;
      const lat2 = c2.lat || c2[0] || 0, lon2 = c2.lon || c2[1] || 0;
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      d += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      rawPoints.push({ dist: d, ele: c2.ele || c2[2] || 0 });
    }
  }

  const simplified = simplifyProfileCurve(rawPoints, 65, 2.0);
  const totalD = simplified.length >= 2 ? Math.round(simplified[simplified.length - 1][0]) : 0;
  const startE = simplified.length >= 1 ? Math.round(simplified[0][1]) : 0;

  // Total Distance (3 bytes Uint24)
  buf.push((totalD >> 16) & 0xff, (totalD >> 8) & 0xff, totalD & 0xff);

  // Start Elevation (2 bytes Int16)
  const se16 = startE < 0 ? startE + 0x10000 : startE;
  buf.push((se16 >> 8) & 0xff, se16 & 0xff);

  // Point count (1 byte)
  buf.push(simplified.length);

  let prevD = 0;
  let prevE = startE;
  for (let i = 1; i < simplified.length; i++) {
    const [d, e] = simplified[i];
    const deltaD = Math.round((d - prevD) / 10); // in decameters
    const deltaE = Math.round((e - prevE) * 10); // in decimeters
    writeVarint(buf, deltaD);
    writeVarint(buf, deltaE);
    prevD = d;
    prevE = e;
  }

  // 3. Settings Bitfields
  const s = appState.settings || {};
  const themeIdx = THEME_INDEX[s.theme] !== undefined ? THEME_INDEX[s.theme] : 0;
  const unitsBit = s.units === 'imperial' ? 1 : 0;
  buf.push((unitsBit << 7) | (themeIdx & 0x7f));

  const flags = (
    (s.showHeader !== false ? 1 : 0) |
    ((s.showDistanceTicks !== false ? 1 : 0) << 1) |
    ((s.showElevationLabels !== false ? 1 : 0) << 2) |
    ((s.showClimbs !== false ? 1 : 0) << 3) |
    ((s.showWaypoints !== false ? 1 : 0) << 4) |
    ((s.showWaypointLabels !== false ? 1 : 0) << 5) |
    ((s.showCutGuidelines !== false ? 1 : 0) << 6) |
    ((s.showBlockPct !== false ? 1 : 0) << 7)
  );
  buf.push(flags);

  buf.push(Math.max(10, Math.min(255, Math.round(s.widthMm || 110))));
  buf.push(Math.max(10, Math.min(255, Math.round(s.heightMm || 35))));

  const blockSize = Math.round(s.blockSizeM !== undefined ? s.blockSizeM : 1000);
  buf.push((blockSize >> 8) & 0xff, blockSize & 0xff);
  buf.push(Math.max(1, Math.min(21, Math.round(s.smoothingWindow || 7))));

  // 4. Hidden Climb Badges (climb ids as varints)
  const hc = (Array.isArray(s.hiddenClimbIds) ? s.hiddenClimbIds : [])
    .map(id => parseInt(id, 10)).filter(Number.isFinite).slice(0, 255);
  buf.push(hc.length);
  for (const id of hc) writeVarint(buf, id);

  // 5. Waypoints
  const wpts = Array.isArray(appState.waypoints) ? appState.waypoints : [];
  buf.push(Math.min(255, wpts.length));
  for (let i = 0; i < wpts.length && i < 255; i++) {
    const w = wpts[i];
    const dm = Math.min(65535, Math.round((w.distM || 0) / 10));
    buf.push((dm >> 8) & 0xff, dm & 0xff);

    const typeIdx = WPT_TYPE_INDEX[w.type] !== undefined ? WPT_TYPE_INDEX[w.type] : 0;
    const enBit = w.enabled !== false ? 1 : 0;
    buf.push((enBit << 7) | (typeIdx & 0x7f));

    writeText(buf, titleEncoder, (w.label || '').slice(0, 50), 255);
  }

  // 6. Fuel plan
  writeFueling(buf, titleEncoder, appState.fueling);

  return new Uint8Array(buf);
}

/**
 * Deserializes a packed binary Uint8Array buffer back into application state (protocol v4).
 *
 * @param {Uint8Array} bytes - Packed binary buffer
 * @returns {Object|null} Normalized application state object
 */
export function deserializeBinaryState(bytes) {
  if (!bytes || bytes.length < 8 || bytes[0] !== SHARE_PROTOCOL_VERSION) return null;

  try {
    const offsetObj = { offset: 1 };
    const titleDecoder = new TextDecoder();

    // 1. Title
    if (offsetObj.offset >= bytes.length) return null;
    const titleLen = bytes[offsetObj.offset++];
    if (offsetObj.offset + titleLen > bytes.length) return null;
    const title = titleDecoder.decode(safeReadSlice(bytes, offsetObj.offset, titleLen));
    offsetObj.offset += titleLen;

    // 2. Route Profile
    if (offsetObj.offset + 6 > bytes.length) return null;
    const totalD = (bytes[offsetObj.offset] << 16) | (bytes[offsetObj.offset + 1] << 8) | bytes[offsetObj.offset + 2];
    offsetObj.offset += 3;

    let startE = (bytes[offsetObj.offset] << 8) | bytes[offsetObj.offset + 1];
    if (startE >= 0x8000) startE -= 0x10000;
    offsetObj.offset += 2;

    const nPts = bytes[offsetObj.offset++];
    const simplified = [[0, startE]];
    let prevD = 0;
    let prevE = startE;

    for (let i = 1; i < nPts; i++) {
      if (offsetObj.offset >= bytes.length) return null;
      const deltaD = readVarint(bytes, offsetObj);
      const deltaE = readVarint(bytes, offsetObj);
      // Distances only grow and cannot exceed what the 3-byte total field can express;
      // otherwise a crafted link makes the dense reconstruction below build millions of points
      if (deltaD < 0) return null;
      prevD += deltaD * 10;
      if (prevD > MAX_DISTANCE_M) return null;
      prevE += deltaE / 10.0;
      simplified.push([prevD, prevE]);
    }

    // 3. Settings
    if (offsetObj.offset + 6 > bytes.length) return null;
    const bTheme = bytes[offsetObj.offset++];
    const units = (bTheme & 0x80) ? 'imperial' : 'metric';
    const theme = THEME_NAMES[bTheme & 0x7f] || 'white';

    const flags = bytes[offsetObj.offset++];
    const showHeader = Boolean(flags & (1 << 0));
    const showDistanceTicks = Boolean(flags & (1 << 1));
    const showElevationLabels = Boolean(flags & (1 << 2));
    const showClimbs = Boolean(flags & (1 << 3));
    const showWaypoints = Boolean(flags & (1 << 4));
    const showWaypointLabels = Boolean(flags & (1 << 5));
    const showCutGuidelines = Boolean(flags & (1 << 6));
    const showBlockPct = Boolean(flags & (1 << 7));

    const widthMm = bytes[offsetObj.offset++];
    const heightMm = bytes[offsetObj.offset++];
    const blockSizeM = (bytes[offsetObj.offset] << 8) | bytes[offsetObj.offset + 1];
    offsetObj.offset += 2;
    const smoothingWindow = bytes[offsetObj.offset++];

    // 4. Hidden Climbs
    if (offsetObj.offset >= bytes.length) return null;
    const nHc = bytes[offsetObj.offset++];
    const hiddenClimbIds = [];
    for (let i = 0; i < nHc; i++) {
      if (offsetObj.offset >= bytes.length) return null;
      hiddenClimbIds.push(readVarint(bytes, offsetObj));
    }

    // 5. Waypoints
    if (offsetObj.offset >= bytes.length) return null;
    const nWpts = bytes[offsetObj.offset++];
    const waypoints = [];
    for (let i = 0; i < nWpts; i++) {
      if (offsetObj.offset + 4 > bytes.length) return null;
      const dm = (bytes[offsetObj.offset] << 8) | bytes[offsetObj.offset + 1];
      offsetObj.offset += 2;

      const bType = bytes[offsetObj.offset++];
      const enabled = Boolean(bType & 0x80);
      const typeIdx = bType & 0x7f;
      const type = WPT_TYPE_NAMES[typeIdx] || 'feed';

      const lblLen = bytes[offsetObj.offset++];
      if (offsetObj.offset + lblLen > bytes.length) return null;
      const label = titleDecoder.decode(safeReadSlice(bytes, offsetObj.offset, lblLen));
      offsetObj.offset += lblLen;

      waypoints.push({
        id: `wpt-sh-${i + 1}`,
        distM: dm * 10,
        type,
        label,
        enabled
      });
    }

    // 6. Fuel plan
    const fueling = readFueling(bytes, offsetObj, titleDecoder);

    // 7. Dense Coordinate Signal Reconstruction for Smooth Telemetry
    const denseCoords = [];
    const maxD = simplified[simplified.length - 1][0] || totalD || 1000;
    const stepM = Math.max(50, Math.min(200, maxD / 600));
    let curIdx = 0;

    for (let d = 0; d <= maxD; d += stepM) {
      while (curIdx < simplified.length - 1 && simplified[curIdx + 1][0] < d) {
        curIdx++;
      }
      const [d0, e0] = simplified[curIdx];
      const [d1, e1] = simplified[Math.min(simplified.length - 1, curIdx + 1)];
      const ratio = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
      const ele = e0 + ratio * (e1 - e0);
      denseCoords.push({
        dist: d,
        lat: d / 111319.5,
        lon: 0,
        ele
      });
    }

    const settings = {
      ...DEFAULT_SETTINGS,
      title,
      theme,
      units,
      widthMm,
      heightMm,
      blockSizeM,
      smoothingWindow,
      showHeader,
      showDistanceTicks,
      showElevationLabels,
      showClimbs,
      showWaypoints,
      showWaypointLabels,
      showCutGuidelines,
      showBlockPct,
      hiddenClimbIds
    };

    return {
      title,
      coords: denseCoords,
      settings,
      waypoints,
      fueling
    };
  } catch (_) {
    return null;
  }
}
