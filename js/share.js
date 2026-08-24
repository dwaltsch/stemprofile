/**
 * Ultra-Compact Binary Sharing & Compression Engine for GitHub Pages
 *
 * Enables instant URL-based route profile sharing without any backend database.
 * Encodes:
 * 1. Adaptive curvature & peak-preserved elevation profile curve (Version 3 Binary Protocol)
 * 2. Route title and visual layout settings (dimensions, blocks, theme, units)
 * 3. Race cues & waypoints (feed, sprints, summits, checkpoints)
 * 4. Hidden climb label preferences
 *
 * Compresses data using native browser `CompressionStream('deflate-raw')` / `CompressionStream('gzip')`
 * and encodes as Base64URL for ultra-short ~120-250 character share links.
 *
 * @module share
 */

/**
 * Standard default settings dictionary used to prune redundant keys during serialization.
 */
export const DEFAULT_SETTINGS = {
  widthMm: 110,
  heightMm: 35,
  radiusMm: 2,
  smoothingWindow: 7,
  blockSizeM: 1000,
  showBlockPct: true,
  units: 'metric',
  theme: 'white',
  showHeader: true,
  showDistanceTicks: true,
  showElevationLabels: true,
  showClimbs: true,
  showWaypoints: true,
  showWaypointLabels: true,
  showCutGuidelines: true,
  printCopies: 2,
  hiddenClimbIds: []
};

export const THEME_NAMES = ['white', 'giro', 'tour', 'gravel', 'dark', 'neon'];
export const THEME_INDEX = {
  'white': 0,
  'giro': 1,
  'tour': 2,
  'gravel': 3,
  'dark': 4,
  'neon': 5
};

export const WPT_TYPE_NAMES = ['feed', 'water', 'food', 'sprint', 'summit', 'caution', 'mech', 'checkpoint', 'custom'];
export const WPT_TYPE_INDEX = {
  'feed': 0,
  'water': 1,
  'food': 2,
  'sprint': 3,
  'summit': 4,
  'caution': 5,
  'mech': 6,
  'checkpoint': 7,
  'custom': 8
};

/**
 * Encodes a signed integer into a variable-length ASCII character sequence (Google Polyline algorithm).
 * Kept for polyline compatibility.
 *
 * @param {number} val - Signed integer
 * @returns {string} ASCII encoded chunk
 */
export function encodeSignedVarint(val) {
  let v = val < 0 ? ~(val << 1) : (val << 1);
  let str = '';
  while (v >= 0x20) {
    str += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  str += String.fromCharCode(v + 63);
  return str;
}

/**
 * Decodes a single signed integer from a variable-length ASCII sequence.
 *
 * @param {string} str - Polyline string
 * @param {number} startIdx - Starting character index
 * @returns {[number, number]} [Decoded signed integer, Next character index]
 */
export function decodeSignedVarint(str, startIdx) {
  let result = 0;
  let shift = 0;
  let idx = startIdx;
  while (idx < str.length) {
    const byte = str.charCodeAt(idx++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    if (!(byte & 0x20)) break;
  }
  const val = (result & 1) ? ~(result >> 1) : (result >> 1);
  return [val, idx];
}

/**
 * Encodes an array of 3D coordinates [[lat, lon, ele], ...] into a compact Polyline string.
 *
 * @param {Array<[number, number, number]>} coords - [[lat, lon, ele], ...]
 * @returns {string} Encoded 3D polyline string
 */
export function encodePolyline3D(coords) {
  if (!coords || coords.length === 0) return '';
  let str = '';
  let prevLat = 0;
  let prevLon = 0;
  let prevEle = 0;

  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const lat = Math.round((Array.isArray(c) ? c[0] : (c.lat || 0)) * 100000);
    const lon = Math.round((Array.isArray(c) ? c[1] : (c.lon || 0)) * 100000);
    const ele = Math.round((Array.isArray(c) ? (c[2] !== undefined ? c[2] : 0) : (c.ele !== undefined ? c.ele : 0)) * 10);

    str += encodeSignedVarint(lat - prevLat);
    str += encodeSignedVarint(lon - prevLon);
    str += encodeSignedVarint(ele - prevEle);

    prevLat = lat;
    prevLon = lon;
    prevEle = ele;
  }

  return str;
}

/**
 * Decodes a 3D Polyline string back into coordinate tuples [[lat, lon, ele], ...].
 *
 * @param {string} str - Encoded 3D polyline string
 * @returns {Array<[number, number, number]>} Array of [lat, lon, ele]
 */
export function decodePolyline3D(str) {
  if (!str) return [];
  const coords = [];
  let idx = 0;
  let lat = 0;
  let lon = 0;
  let ele = 0;

  while (idx < str.length) {
    const [dLat, nextIdx1] = decodeSignedVarint(str, idx);
    const [dLon, nextIdx2] = decodeSignedVarint(str, nextIdx1);
    const [dEle, nextIdx3] = decodeSignedVarint(str, nextIdx2);

    idx = nextIdx3;
    lat += dLat;
    lon += dLon;
    ele += dEle;

    coords.push([lat / 100000, lon / 100000, ele / 10]);
  }

  return coords;
}

/**
 * Smartly downsamples coordinates while preserving endpoints and elevation extrema.
 *
 * @param {Array<[number, number, number]|{lat:number, lon:number, ele:number}>} coords - Route coordinates
 * @param {number} [targetPoints=180] - Target points budget
 * @returns {Array<[number, number, number]>} Downsampled coordinates array
 */
export function downsampleCoords(coords, targetPoints = 180) {
  if (!coords || coords.length === 0) return [];

  const getLat = c => Array.isArray(c) ? c[0] : (c.lat || 0);
  const getLon = c => Array.isArray(c) ? c[1] : (c.lon || 0);
  const getEle = c => Array.isArray(c) ? (c[2] !== undefined ? c[2] : 0) : (c.ele !== undefined ? c.ele : 0);

  const N = coords.length;
  if (N <= targetPoints) {
    return coords.map(c => [
      Math.round(getLat(c) * 100000) / 100000,
      Math.round(getLon(c) * 100000) / 100000,
      Math.round(getEle(c) * 10) / 10
    ]);
  }

  let minIdx = 0, maxIdx = 0;
  let minEle = getEle(coords[0]), maxEle = minEle;

  for (let i = 1; i < N; i++) {
    const e = getEle(coords[i]);
    if (e < minEle) { minEle = e; minIdx = i; }
    if (e > maxEle) { maxEle = e; maxIdx = i; }
  }

  const indicesSet = new Set([0, N - 1, minIdx, maxIdx]);

  for (let i = 1; i < N - 1; i++) {
    const prevE = getEle(coords[i - 1]);
    const currE = getEle(coords[i]);
    const nextE = getEle(coords[i + 1]);
    if ((currE >= prevE && currE > nextE && Math.abs(currE - prevE) >= 3) ||
        (currE <= prevE && currE < nextE && Math.abs(currE - prevE) >= 3)) {
      indicesSet.add(i);
    }
  }

  const step = (N - 1) / (targetPoints - 1);
  for (let i = 0; i < targetPoints; i++) {
    indicesSet.add(Math.round(i * step));
  }

  let sortedIndices = Array.from(indicesSet).sort((a, b) => a - b);
  if (sortedIndices.length > targetPoints) {
    const mustKeep = new Set([0, N - 1, minIdx, maxIdx]);
    const subStep = (sortedIndices.length - 1) / (targetPoints - 1);
    const reducedSet = new Set(mustKeep);
    for (let i = 0; i < targetPoints; i++) {
      reducedSet.add(sortedIndices[Math.round(i * subStep)]);
    }
    sortedIndices = Array.from(reducedSet).sort((a, b) => a - b);
  }

  return sortedIndices.map(i => {
    const c = coords[i];
    return [
      Math.round(getLat(c) * 100000) / 100000,
      Math.round(getLon(c) * 100000) / 100000,
      Math.round(getEle(c) * 10) / 10
    ];
  });
}

/**
 * Simplifies a distance-elevation profile using Douglas-Peucker 2D polygon reduction
 * with strict summit, valley, start, and finish landmark preservation.
 *
 * @param {Array<{dist: number, ele?: number, smoothEle?: number}>} points - Track points
 * @param {number} [maxPoints=75] - Maximum point budget
 * @param {number} [epsilon=2.0] - Elevation tolerance in meters
 * @returns {Array<[number, number]>} Simplified array of [distMeters, eleMeters]
 */
export function simplifyProfileCurve(points, maxPoints = 75, epsilon = 2.0) {
  if (!points || points.length <= 2) {
    return (points || []).map(p => [
      Math.round(p.dist || 0),
      Math.round((p.ele !== undefined ? p.ele : (p.smoothEle || 0)) * 10) / 10
    ]);
  }

  const N = points.length;
  const critical = new Set([0, N - 1]);
  let minIdx = 0, maxIdx = 0;

  for (let i = 1; i < N; i++) {
    const e = points[i].ele !== undefined ? points[i].ele : (points[i].smoothEle || 0);
    const minE = points[minIdx].ele !== undefined ? points[minIdx].ele : (points[minIdx].smoothEle || 0);
    const maxE = points[maxIdx].ele !== undefined ? points[maxIdx].ele : (points[maxIdx].smoothEle || 0);
    if (e < minE) minIdx = i;
    if (e > maxE) maxIdx = i;
  }
  critical.add(minIdx);
  critical.add(maxIdx);

  // Identify prominent mountain summits (peaks with >= 15m prominence)
  const windowSize = Math.max(2, Math.floor(N / 40));
  for (let i = windowSize; i < N - windowSize; i += windowSize) {
    let localPeakIdx = i;
    for (let j = i - windowSize; j <= i + windowSize; j++) {
      const eJ = points[j].ele !== undefined ? points[j].ele : (points[j].smoothEle || 0);
      const eMax = points[localPeakIdx].ele !== undefined ? points[localPeakIdx].ele : (points[localPeakIdx].smoothEle || 0);
      if (eJ > eMax) localPeakIdx = j;
    }
    const ePeak = points[localPeakIdx].ele !== undefined ? points[localPeakIdx].ele : (points[localPeakIdx].smoothEle || 0);
    const eLeft = points[i - windowSize].ele !== undefined ? points[i - windowSize].ele : (points[i - windowSize].smoothEle || 0);
    const eRight = points[i + windowSize].ele !== undefined ? points[i + windowSize].ele : (points[i + windowSize].smoothEle || 0);
    if (ePeak - eLeft >= 15 && ePeak - eRight >= 15) {
      critical.add(localPeakIdx);
    }
  }

  const sortedLandmarks = Array.from(critical).sort((a, b) => a - b);
  const selectedSet = new Set(sortedLandmarks);

  function rdpSegment(startIdx, endIdx, eps) {
    if (endIdx - startIdx <= 1) return;
    let maxD = 0;
    let bestIdx = startIdx;

    const x1 = points[startIdx].dist;
    const y1 = points[startIdx].ele !== undefined ? points[startIdx].ele : (points[startIdx].smoothEle || 0);
    const x2 = points[endIdx].dist;
    const y2 = points[endIdx].ele !== undefined ? points[endIdx].ele : (points[endIdx].smoothEle || 0);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLen = Math.hypot(dx, dy);

    for (let i = startIdx + 1; i < endIdx; i++) {
      const px = points[i].dist;
      const py = points[i].ele !== undefined ? points[i].ele : (points[i].smoothEle || 0);
      let d = 0;
      if (lineLen === 0) {
        d = Math.abs(py - y1);
      } else {
        d = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / lineLen;
      }
      if (d > maxD) {
        maxD = d;
        bestIdx = i;
      }
    }

    if (maxD > eps) {
      selectedSet.add(bestIdx);
      rdpSegment(startIdx, bestIdx, eps);
      rdpSegment(bestIdx, endIdx, eps);
    }
  }

  for (let s = 0; s < sortedLandmarks.length - 1; s++) {
    rdpSegment(sortedLandmarks[s], sortedLandmarks[s + 1], epsilon);
  }

  let finalIndices = Array.from(selectedSet).sort((a, b) => a - b);

  if (finalIndices.length > maxPoints) {
    const step = (finalIndices.length - 1) / (maxPoints - 1);
    const pruned = new Set(sortedLandmarks);
    for (let i = 0; i < maxPoints; i++) {
      pruned.add(finalIndices[Math.round(i * step)]);
    }
    finalIndices = Array.from(pruned).sort((a, b) => a - b);
  }

  return finalIndices.map(i => {
    const d = points[i].dist !== undefined ? points[i].dist : 0;
    const e = points[i].ele !== undefined ? points[i].ele : (points[i].smoothEle || 0);
    return [Math.round(d), Math.round(e * 10) / 10];
  });
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
  while (true) {
    if (offsetObj.offset >= bytes.length) break;
    const b = bytes[offsetObj.offset++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
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

  const offsetObj = { offset: 1 };
  const titleDecoder = new TextDecoder();

  // 1. Title
  const titleLen = bytes[offsetObj.offset++];
  const title = titleDecoder.decode(bytes.subarray(offsetObj.offset, offsetObj.offset + titleLen));
  offsetObj.offset += titleLen;

  // 2. Route Profile
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
    const deltaD = readVarint(bytes, offsetObj);
    const deltaE = readVarint(bytes, offsetObj);
    prevD += deltaD * 10;
    prevE += deltaE / 10.0;
    simplified.push([prevD, prevE]);
  }

  // 3. Settings
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
  const nHc = bytes[offsetObj.offset++];
  const hiddenClimbIds = [];
  for (let i = 0; i < nHc; i++) {
    hiddenClimbIds.push(bytes[offsetObj.offset++]);
  }

  // 5. Waypoints
  const nWpts = bytes[offsetObj.offset++];
  const waypoints = [];
  for (let i = 0; i < nWpts; i++) {
    const dm = (bytes[offsetObj.offset] << 8) | bytes[offsetObj.offset + 1];
    offsetObj.offset += 2;

    const bType = bytes[offsetObj.offset++];
    const enabled = Boolean(bType & 0x80);
    const typeIdx = bType & 0x7f;
    const type = WPT_TYPE_NAMES[typeIdx] || 'feed';

    const lblLen = bytes[offsetObj.offset++];
    const label = titleDecoder.decode(bytes.subarray(offsetObj.offset, offsetObj.offset + lblLen));
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
}

/**
 * Converts a Uint8Array buffer into a URL-safe Base64 string.
 *
 * @param {Uint8Array} bytes - Input buffer
 * @returns {string} Base64URL string
 */
export function uint8ToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Converts a Base64URL string into a Uint8Array buffer.
 *
 * @param {string} b64url - Base64URL string
 * @returns {Uint8Array} Output buffer
 */
export function base64UrlToUint8(b64url) {
  let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compresses an arbitrary JavaScript payload object to a URL-safe Base64 string.
 * Uses native browser compression streams.
 *
 * @param {Object|Uint8Array} data - Data to compress
 * @returns {Promise<string>} Base64URL-encoded payload
 */
export async function compressPayload(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(JSON.stringify(data));

  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([bytes]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('deflate-raw'));
      const response = await new Response(compressedStream);
      const buffer = await response.arrayBuffer();
      return uint8ToBase64Url(new Uint8Array(buffer));
    } catch (_) {
      const stream = new Blob([bytes]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const response = await new Response(compressedStream);
      const buffer = await response.arrayBuffer();
      return uint8ToBase64Url(new Uint8Array(buffer));
    }
  }

  return uint8ToBase64Url(bytes);
}

/**
 * Decompresses a URL-safe Base64 string back into a JavaScript state object.
 *
 * @param {string} b64url - Base64URL string from URL hash
 * @returns {Promise<Object|null>} Parsed and normalized JavaScript state
 */
export async function decompressPayload(b64url) {
  if (!b64url) return null;

  try {
    const bytes = base64UrlToUint8(b64url);

    // 1. Try Decompressing with deflate-raw
    let decompressedBytes = null;
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const stream = new Blob([bytes]).stream();
        const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
        const response = await new Response(decompressedStream);
        const buffer = await response.arrayBuffer();
        decompressedBytes = new Uint8Array(buffer);
      } catch (_) {
        try {
          const stream = new Blob([bytes]).stream();
          const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
          const response = await new Response(decompressedStream);
          const buffer = await response.arrayBuffer();
          decompressedBytes = new Uint8Array(buffer);
        } catch (_) {}
      }
    }

    const payloadData = decompressedBytes || bytes;

    // Check if Version 3 binary protocol
    if (payloadData.length >= 8 && payloadData[0] === 3) {
      return deserializeBinaryState(payloadData);
    }

    // Fallback: parse JSON v2 / legacy
    const jsonStr = new TextDecoder().decode(payloadData);
    return normalizePayload(JSON.parse(jsonStr));

  } catch (err) {
    console.error('Failed to decompress route hash payload:', err);
    return null;
  }
}

/**
 * Normalizes a decoded JSON payload into the application state schema (backward compatibility).
 *
 * @param {Object} rawPayload - Raw JSON payload object { t, p, s, w }
 * @returns {Object|null} Normalized payload
 */
export function normalizePayload(rawPayload) {
  if (!rawPayload) return null;

  let coords = [];
  if (rawPayload.p) {
    coords = decodePolyline3D(rawPayload.p);
  } else if (Array.isArray(rawPayload.coords)) {
    coords = rawPayload.coords;
  }

  if (coords.length < 2) return null;

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(rawPayload.s || rawPayload.settings || {})
  };
  if (rawPayload.s && rawPayload.s.hc && !rawPayload.s.hiddenClimbIds) {
    settings.hiddenClimbIds = rawPayload.s.hc;
  }

  const waypoints = (rawPayload.w || rawPayload.waypoints || []).map((item, idx) => {
    if (Array.isArray(item)) {
      return {
        id: `wpt-sh-${idx + 1}`,
        distM: item[0] || 0,
        type: item[1] || 'feed',
        label: item[2] || '',
        enabled: item[3] !== 0
      };
    }
    return item;
  });

  return {
    title: rawPayload.t || rawPayload.title || '',
    coords,
    settings,
    waypoints
  };
}

/**
 * Serializes active application state into an ultra-compact shareable URL hash.
 *
 * @param {Object} appState - Global application state
 * @returns {Promise<string>} Full hash string starting with '#stage='
 */
export async function serializeStateToHash(appState) {
  if (!appState || (!appState.points?.length && !appState.rawCoords?.length)) {
    return '';
  }

  const binaryPayload = serializeBinaryState(appState);
  const compressed = await compressPayload(binaryPayload);
  return `#stage=${compressed}`;
}

/**
 * Deserializes a shareable hash string into normalized application state.
 *
 * @param {string} hashStr - Raw hash string (e.g. '#stage=...')
 * @returns {Promise<Object|null>} Normalized payload
 */
export async function deserializeHashToState(hashStr) {
  if (!hashStr) return null;
  let b64 = hashStr.trim().replace(/^[#?]/, '');
  if (b64.includes('stage=')) b64 = b64.split('stage=')[1].split('&')[0];
  else if (b64.includes('data=')) b64 = b64.split('data=')[1].split('&')[0];
  else if (b64.includes('route=')) b64 = b64.split('route=')[1].split('&')[0];
  return decompressPayload(b64);
}

/**
 * Generates and copies the full GitHub Pages share link to clipboard.
 *
 * @param {Object} appState - Global application state
 * @returns {Promise<string>} The generated share link URL
 */
export async function copyShareableLink(appState) {
  const hash = await serializeStateToHash(appState);
  if (!hash) {
    throw new Error('No track data to share');
  }

  const url = new URL(window.location.href);
  url.hash = hash;
  const shareUrl = url.toString();

  window.history.replaceState(null, '', hash);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return shareUrl;
    } catch (_) {}
  }

  const ta = document.createElement('textarea');
  ta.value = shareUrl;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch (_) {}
  document.body.removeChild(ta);

  return shareUrl;
}
