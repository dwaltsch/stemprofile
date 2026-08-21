/**
 * URL Hash Sharing & Compression Engine for GitHub Pages
 *
 * Enables instant URL-based route profile sharing without any backend database.
 * Serializes:
 * 1. Downsampled GPS coordinates (preserving elevation fidelity)
 * 2. Route title and visual layout settings (dimensions, blocks, theme, units)
 * 3. Race cues & waypoints (feed, sprints, summits, checkpoints)
 * 4. Custom mouse-dragged label positions
 *
 * Compresses data using native browser `CompressionStream('gzip')` and encodes as Base64URL.
 *
 * @module share
 */

/**
 * Downsamples raw GPS coordinates to a maximum point budget while preserving
 * start, end, and elevation resolution for efficient URL hashing.
 *
 * @param {Array<[number, number, number]>} coords - [[lat, lon, ele], ...]
 * @param {number} [maxPoints=450] - Maximum target points
 * @returns {Array<[number, number, number]>} Downsampled coordinates array
 */
export function downsampleCoords(coords, maxPoints = 450) {
  if (!coords || coords.length === 0) return [];

  const getLat = c => Array.isArray(c) ? c[0] : (c.lat || 0);
  const getLon = c => Array.isArray(c) ? c[1] : (c.lon || 0);
  const getEle = c => Array.isArray(c) ? (c[2] !== undefined ? c[2] : 0) : (c.ele !== undefined ? c.ele : 0);

  if (coords.length <= maxPoints) {
    return coords.map(c => [
      Math.round(getLat(c) * 100000) / 100000,
      Math.round(getLon(c) * 100000) / 100000,
      Math.round(getEle(c) * 10) / 10
    ]);
  }

  const result = [
    [
      Math.round(getLat(coords[0]) * 100000) / 100000,
      Math.round(getLon(coords[0]) * 100000) / 100000,
      Math.round(getEle(coords[0]) * 10) / 10
    ]
  ];

  const step = (coords.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    const c = coords[idx];
    result.push([
      Math.round(getLat(c) * 100000) / 100000,
      Math.round(getLon(c) * 100000) / 100000,
      Math.round(getEle(c) * 10) / 10
    ]);
  }

  const last = coords[coords.length - 1];
  result.push([
    Math.round(getLat(last) * 100000) / 100000,
    Math.round(getLon(last) * 100000) / 100000,
    Math.round(getEle(last) * 10) / 10
  ]);

  return result;
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
 * @returns {Promise<Object|null>} Parsed JavaScript payload or null on error
 */
export async function decompressPayload(b64url) {
  if (!b64url) return null;

  try {
    if (b64url.startsWith('%7B') || b64url.startsWith('{')) {
      return JSON.parse(decodeURIComponent(b64url));
    }

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
      return JSON.parse(jsonStr);
    }

    return JSON.parse(decodeURIComponent(b64url));
  } catch (err) {
    console.error('Failed to decompress route hash payload:', err);
    return null;
  }
}

/**
 * Serializes active application state into a shareable URL hash payload.
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

  const downsampled = downsampleCoords(coords, 450);

  const payload = {
    v: 1,
    title: appState.settings.title || '',
    coords: downsampled,
    settings: {
      widthMm: appState.settings.widthMm,
      heightMm: appState.settings.heightMm,
      radiusMm: appState.settings.radiusMm,
      smoothingWindow: appState.settings.smoothingWindow,
      blockSizeM: appState.settings.blockSizeM,
      showBlockPct: appState.settings.showBlockPct,
      units: appState.settings.units,
      theme: appState.settings.theme,
      showHeader: appState.settings.showHeader,
      showDistanceTicks: appState.settings.showDistanceTicks,
      showElevationLabels: appState.settings.showElevationLabels,
      showClimbs: appState.settings.showClimbs,
      showWaypoints: appState.settings.showWaypoints,
      showWaypointLabels: appState.settings.showWaypointLabels,
      showCutGuidelines: appState.settings.showCutGuidelines,
      customPositions: appState.settings.customPositions || {}
    },
    waypoints: (appState.waypoints || []).map(w => ({
      id: w.id,
      distM: Math.round(w.distM),
      type: w.type,
      label: w.label || '',
      enabled: w.enabled !== false
    }))
  };

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
