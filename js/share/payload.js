/**
 * Share payload decoding: decompression, protocol detection, legacy JSON normalization and untrusted-input sanitization.
 *
 * @module share/payload
 */

import { DEFAULT_SETTINGS, THEME_NAMES, WPT_TYPE_NAMES, clampSettings } from './constants.js';
import { base64UrlToUint8 } from './compression.js';
import { decodePolyline3D } from './polyline.js';
import { deserializeBinaryState } from './binary.js';

/** Longest share link payload accepted (real links are a few hundred to a few thousand chars). */
export const MAX_LINK_CHARS = 1_000_000;
/** Most bytes a share payload may inflate to; guards against compression bombs. */
export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024;
/** Most route points / waypoints a shared payload may carry; larger routes are evenly thinned. */
export const MAX_SHARED_POINTS = 20000;
export const MAX_SHARED_WAYPOINTS = 255;

class PayloadTooLargeError extends Error {}

/**
 * Inflates bytes with a DecompressionStream, aborting as soon as the output
 * exceeds maxBytes instead of buffering the whole result.
 *
 * @param {Uint8Array} bytes - Compressed input
 * @param {'deflate-raw'|'gzip'} format - Compression format
 * @param {number} maxBytes - Output size limit
 * @returns {Promise<Uint8Array>} Inflated bytes
 * @throws {PayloadTooLargeError} When the output exceeds maxBytes
 */
async function inflateCapped(bytes, format, maxBytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError(`Share payload inflates beyond ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Decompresses a URL-safe Base64 string back into a JavaScript state object.
 *
 * @param {string} b64url - Base64URL string from URL hash
 * @returns {Promise<Object|null>} Parsed and normalized JavaScript state
 */
export async function decompressPayload(b64url) {
  if (!b64url || typeof b64url !== 'string' || b64url.length > MAX_LINK_CHARS) return null;

  try {
    const bytes = base64UrlToUint8(b64url);
    if (!bytes || bytes.length === 0) return null;

    // 1. Try deflate-raw, then gzip; a payload that inflates too far is rejected outright
    let decompressedBytes = null;
    if (typeof DecompressionStream !== 'undefined') {
      for (const format of ['deflate-raw', 'gzip']) {
        try {
          decompressedBytes = await inflateCapped(bytes, format, MAX_DECOMPRESSED_BYTES);
          break;
        } catch (err) {
          if (err instanceof PayloadTooLargeError) return null;
        }
      }
    }

    const payloadData = decompressedBytes || bytes;
    if (!payloadData || payloadData.length === 0) return null;

    // Check if Version 3 binary protocol
    if (payloadData.length >= 8 && payloadData[0] === 3) {
      return deserializeBinaryState(payloadData);
    }

    // Fallback: parse JSON v2 / legacy
    try {
      const jsonStr = new TextDecoder().decode(payloadData);
      return normalizePayload(JSON.parse(jsonStr));
    } catch (_) {
      return null;
    }

  } catch (_) {
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

const SAFE_ID_RE = /^[\w-]{1,64}$/;
const UNIT_NAMES = ['metric', 'imperial'];

/**
 * Whitelists and type-checks a decoded share payload. Shared links are untrusted
 * input, so only known settings keys with the expected types survive, and
 * waypoint ids/types are constrained to values safe for markup and lookups.
 *
 * @param {Object} payload - Decoded payload { title, coords, settings, waypoints }
 * @returns {Object|null} Sanitized payload, or null when unusable
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.coords)) return null;

  const raw = (payload.settings && typeof payload.settings === 'object') ? payload.settings : {};
  const settings = {};
  for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
    const val = raw[key];
    if (val === undefined) continue;
    if (typeof def === 'number' && Number.isFinite(val)) settings[key] = val;
    else if (typeof def === 'boolean' && typeof val === 'boolean') settings[key] = val;
  }
  Object.assign(settings, clampSettings(settings));
  if (THEME_NAMES.includes(raw.theme)) settings.theme = raw.theme;
  if (UNIT_NAMES.includes(raw.units)) settings.units = raw.units;
  if (typeof raw.title === 'string') settings.title = raw.title.slice(0, 120);
  if (Array.isArray(raw.hiddenClimbIds)) {
    settings.hiddenClimbIds = raw.hiddenClimbIds.filter(id => Number.isFinite(id) || (typeof id === 'string' && SAFE_ID_RE.test(id)));
  }
  if (raw.customPositions && typeof raw.customPositions === 'object') {
    settings.customPositions = {};
    for (const [key, pos] of Object.entries(raw.customPositions)) {
      if (SAFE_ID_RE.test(key) && pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        settings.customPositions[key] = { x: pos.x, y: pos.y };
      }
    }
  }

  const rawWpts = (Array.isArray(payload.waypoints) ? payload.waypoints : []).slice(0, MAX_SHARED_WAYPOINTS);
  const waypoints = rawWpts
    .filter(w => w && typeof w === 'object' && Number.isFinite(w.distM))
    .map((w, idx) => ({
      id: (typeof w.id === 'string' && SAFE_ID_RE.test(w.id)) ? w.id : `wpt-sh-${idx + 1}`,
      distM: Math.max(0, w.distM),
      type: WPT_TYPE_NAMES.includes(w.type) ? w.type : 'feed',
      label: typeof w.label === 'string' ? w.label.slice(0, 50) : '',
      enabled: w.enabled !== false
    }));

  return {
    title: typeof payload.title === 'string' ? payload.title.slice(0, 120) : undefined,
    coords: thinEvenly(payload.coords, MAX_SHARED_POINTS),
    settings,
    waypoints
  };
}

/**
 * Keeps at most `max` items, evenly spaced, always including the first and last.
 *
 * @param {Array} items
 * @param {number} max
 * @returns {Array}
 */
function thinEvenly(items, max) {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}
