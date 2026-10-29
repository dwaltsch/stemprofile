/**
 * 3D polyline delta encoding (Google Polyline algorithm extended with elevation), used by legacy JSON links.
 *
 * @module share/polyline
 */

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
