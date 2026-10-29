/**
 * Packed binary share protocol (version 3): serializes and deserializes app state to a Uint8Array.
 *
 * @module share/binary
 */

import { DEFAULT_SETTINGS, THEME_INDEX, THEME_NAMES, WPT_TYPE_INDEX, WPT_TYPE_NAMES } from './constants.js';
import { simplifyProfileCurve } from './simplify.js';

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
  buf.push(3); // Magic Protocol Version 3

  // 1. Title UTF-8
  const titleStr = (appState.settings && appState.settings.title) || appState.title || '';
  const titleEncoder = new TextEncoder();
  const titleBytes = titleEncoder.encode(titleStr.slice(0, 120));
  buf.push(titleBytes.length);
  for (let i = 0; i < titleBytes.length; i++) buf.push(titleBytes[i]);

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

  // 4. Hidden Climb Badges
  const hc = Array.isArray(s.hiddenClimbIds) ? s.hiddenClimbIds : [];
  buf.push(Math.min(255, hc.length));
  for (let i = 0; i < hc.length && i < 255; i++) {
    buf.push(parseInt(hc[i], 10) & 0xff);
  }

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

    const lblBytes = titleEncoder.encode((w.label || '').slice(0, 50));
    buf.push(lblBytes.length);
    for (let k = 0; k < lblBytes.length; k++) buf.push(lblBytes[k]);
  }

  return new Uint8Array(buf);
}

/**
 * Deserializes a packed binary Uint8Array buffer back into application state (Protocol v3).
 *
 * @param {Uint8Array} bytes - Packed binary buffer
 * @returns {Object|null} Normalized application state object
 */
export function deserializeBinaryState(bytes) {
  if (!bytes || bytes.length < 8 || bytes[0] !== 3) return null;

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
      prevD += deltaD * 10;
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
    if (offsetObj.offset + nHc > bytes.length) return null;
    const hiddenClimbIds = [];
    for (let i = 0; i < nHc; i++) {
      hiddenClimbIds.push(bytes[offsetObj.offset++]);
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

    // 6. Dense Coordinate Signal Reconstruction for Smooth Telemetry
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
      waypoints
    };
  } catch (_) {
    return null;
  }
}
