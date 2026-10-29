/**
 * Base64URL conversion and deflate-raw / gzip compression via native CompressionStream.
 *
 * @module share/compression
 */

/**
 * Converts a Uint8Array buffer into a URL-safe Base64 string.
 *
 * @param {Uint8Array} bytes - Input buffer
 * @returns {string} Base64URL string
 */
export function uint8ToBase64Url(bytes) {
  if (!bytes || bytes.length === 0) return '';
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
  if (!b64url || typeof b64url !== 'string') return new Uint8Array(0);
  try {
    let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    return new Uint8Array(0);
  }
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
      try {
        const stream = new Blob([bytes]).stream();
        const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
        const response = await new Response(compressedStream);
        const buffer = await response.arrayBuffer();
        return uint8ToBase64Url(new Uint8Array(buffer));
      } catch (_) {}
    }
  }

  return uint8ToBase64Url(bytes);
}
