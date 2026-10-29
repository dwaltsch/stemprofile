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

import { compressPayload } from './share/compression.js';
import { decompressPayload } from './share/payload.js';
import { serializeBinaryState } from './share/binary.js';

export * from './share/constants.js';
export * from './share/simplify.js';
export * from './share/binary.js';
export * from './share/compression.js';
export * from './share/payload.js';

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
  return decompressPayload(extractHashPayload(hashStr));
}

/**
 * Extracts the Base64URL payload from a URL hash or query string.
 * Accepts `#stage=`, `?data=` and `route=` keys, or a bare payload.
 *
 * @param {string} hashStr - Raw hash/query string (e.g. '#stage=...')
 * @returns {string} Base64URL payload ('' when empty)
 */
export function extractHashPayload(hashStr) {
  if (!hashStr) return '';
  let raw = hashStr.trim().replace(/^[#?]/, '');
  try {
    raw = decodeURIComponent(raw);
  } catch (_) {}
  for (const key of ['stage=', 'data=', 'route=']) {
    if (raw.includes(key)) return raw.split(key)[1].split('&')[0];
  }
  return raw;
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
