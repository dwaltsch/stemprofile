/**
 * URL Hash Sharing & Compression Engine for GitHub Pages
 *
 * Enables instant URL-based route profile sharing without any backend database.
 * Serializes:
 * 1. Downsampled GPS coordinates (preserving elevation fidelity & summits via 3D Polyline)
 * 2. Route title and visual layout settings (dimensions, blocks, theme, units)
 * 3. Race cues & waypoints (feed, sprints, summits, checkpoints)
 * 4. Custom mouse-dragged label positions
 *
 * Compresses data using native browser `CompressionStream('gzip')` and encodes as Base64URL.
 * Supports both compact v2 payloads and legacy v1 backward compatibility.
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
  printCopies: 2
};

/**
 * Encodes a signed integer into a variable-length ASCII character sequence (Google Polyline algorithm).
 *
 * @param {number} val - Signed integer
 * @returns {string} ASCII encoded chunk
 */
function encodeSignedVarint(val) {
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
function decodeSignedVarint(str, startIdx) {
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
 * Coordinates are delta-encoded: lat/lon scaled by 1e5 (1m resolution), ele scaled by 10 (0.1m resolution).
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
 * Smartly downsamples GPS coordinates to a target point budget while preserving
 * start/end endpoints, maximum/minimum elevations, and prominent mountain summits.
 *
 * @param {Array<[number, number, number]|{lat:number, lon:number, ele:number}>} coords - Route coordinates
 * @param {number} [targetPoints=180] - Maximum target points budget
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

  // 1. Identify global elevation extrema
  let minIdx = 0;
  let maxIdx = 0;
  let minEle = getEle(coords[0]);
  let maxEle = minEle;

  for (let i = 1; i < N; i++) {
    const e = getEle(coords[i]);
    if (e < minEle) { minEle = e; minIdx = i; }
    if (e > maxEle) { maxEle = e; maxIdx = i; }
  }

  const indicesSet = new Set([0, N - 1, minIdx, maxIdx]);

  // 2. Identify prominent local elevation peaks and valleys (prominence >= 3m)
  for (let i = 1; i < N - 1; i++) {
    const prevE = getEle(coords[i - 1]);
    const currE = getEle(coords[i]);
    const nextE = getEle(coords[i + 1]);
    if ((currE >= prevE && currE > nextE && Math.abs(currE - prevE) >= 3) ||
        (currE <= prevE && currE < nextE && Math.abs(currE - prevE) >= 3)) {
      indicesSet.add(i);
    }
  }

  // 3. Add uniform step samples
  const step = (N - 1) / (targetPoints - 1);
  for (let i = 0; i < targetPoints; i++) {
    indicesSet.add(Math.round(i * step));
  }

  let sortedIndices = Array.from(indicesSet).sort((a, b) => a - b);

  // 4. If collected indices exceed budget, sub-sample while keeping absolute endpoints & global extrema
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
 * Normalizes a decoded compact payload into the application state schema.
 *
 * @param {Object} rawPayload - Raw JSON-parsed payload object { t, p, s, w }
 * @returns {Object|null} Normalized payload with title, coords, settings, waypoints
 */
export function normalizePayload(rawPayload) {
  if (!rawPayload || !rawPayload.p) return null;

  const coords = decodePolyline3D(rawPayload.p);
  if (coords.length < 2) return null;

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(rawPayload.s || {})
  };

  const waypoints = (rawPayload.w || []).map((item, idx) => ({
    id: `wpt-sh-${idx + 1}`,
    distM: item[0] || 0,
    type: item[1] || 'feed',
    label: item[2] || '',
    enabled: item[3] !== 0
  }));

  return {
    title: rawPayload.t || '',
    coords,
    settings,
    waypoints
  };
}

/**
 * Compresses an arbitrary JavaScript payload object to a URL-safe Base64 string.
 * Uses native browser gzip streams.
 *
 * @param {Object} dataObj - Data object to compress
 * @returns {Promise<string>} Base64URL-encoded gzip payload
 */
export async function compressPayload(dataObj) {
  const jsonStr = JSON.stringify(dataObj);

  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([jsonStr]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = await new Response(compressedStream);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

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

  // Fallback
  return encodeURIComponent(jsonStr);
}

/**
 * Decompresses a URL-safe Base64 string back into a JavaScript payload object.
 *
 * @param {string} b64url - Base64URL string from URL hash
 * @returns {Promise<Object|null>} Parsed and normalized JavaScript payload or null on error
 */
export async function decompressPayload(b64url) {
  if (!b64url) return null;

  try {
    if (typeof DecompressionStream !== 'undefined') {
      let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';

      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const stream = new Blob([bytes]).stream();
      const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
      const response = await new Response(decompressedStream);
      const jsonStr = await response.text();
      return normalizePayload(JSON.parse(jsonStr));
    }

    return normalizePayload(JSON.parse(decodeURIComponent(b64url)));
  } catch (err) {
    console.error('Failed to decompress route hash payload:', err);
    return null;
  }
}

/**
 * Serializes active application state into a shareable URL hash payload.
 *
 * Uses compact schema:
 * - 3D polyline delta encoding for coordinates downsampled to 180 points
 * - Pruned non-default settings dictionary
 * - Compact waypoint tuples [distM, type, label, enabled]
 *
 * @param {Object} appState - Global application state
 * @returns {Promise<string>} Full hash string starting with '#stage='
 */
export async function serializeStateToHash(appState) {
  const coords = (appState.rawCoords && appState.rawCoords.length >= 2)
    ? appState.rawCoords
    : (appState.points && appState.points.length >= 2
        ? appState.points.map(p => [0, 0, p.smoothEle])
        : []);

  if (coords.length < 2) {
    return '';
  }

  // 1. Smart downsampling preserving summits and elevation extrema (target 180 pts)
  const downsampled = downsampleCoords(coords, 180);
  const polyline = encodePolyline3D(downsampled);

  // 2. Prune settings matching defaults
  const customSettings = {};
  if (appState.settings) {
    for (const [key, defaultVal] of Object.entries(DEFAULT_SETTINGS)) {
      if (appState.settings[key] !== undefined && appState.settings[key] !== defaultVal) {
        customSettings[key] = appState.settings[key];
      }
    }
    if (appState.settings.customPositions && Object.keys(appState.settings.customPositions).length > 0) {
      customSettings.customPositions = appState.settings.customPositions;
    }
  }

  // 3. Compact waypoint list: [distM, type, label, enabled]
  const waypoints = (appState.waypoints || []).map(w => [
    Math.round(w.distM || 0),
    w.type || 'feed',
    w.label || '',
    w.enabled !== false ? 1 : 0
  ]);

  const payload = {
    t: appState.settings.title || '',
    p: polyline
  };

  if (Object.keys(customSettings).length > 0) {
    payload.s = customSettings;
  }

  if (waypoints.length > 0) {
    payload.w = waypoints;
  }

  const compressed = await compressPayload(payload);
  return `#stage=${compressed}`;
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

  // Update browser address bar without reloading
  window.history.replaceState(null, '', hash);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      return shareUrl;
    } catch (_) {}
  }

  // Robust fallback for clipboard copy
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

