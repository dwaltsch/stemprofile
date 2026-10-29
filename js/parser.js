/**
 * Route File Parser Registry
 *
 * Zero-dependency ingestion of GPX, TCX and FIT route files. Format parsers live
 * in js/parsers/; this module selects one by extension or content sniffing and
 * re-exports their public API.
 *
 * @module parser
 */

import { isFitBuffer, parseFIT } from './parsers/fit.js';
import { parseGPX } from './parsers/gpx.js';
import { parseTCX } from './parsers/tcx.js';

export { isIsoTimestamp } from './parsers/xml-utils.js';
export * from './parsers/gpx.js';
export * from './parsers/tcx.js';
export * from './parsers/fit.js';

/**
 * @typedef {Object} GpxCoordinate
 * @property {number} lat - Latitude in decimal degrees (WGS84)
 * @property {number} lon - Longitude in decimal degrees (WGS84)
 * @property {number} ele - Elevation above sea level in meters
 */

/**
 * @typedef {Object} GpxRawWaypoint
 * @property {number} lat - Latitude in decimal degrees
 * @property {number} lon - Longitude in decimal degrees
 * @property {string} name - Waypoint name or label
 * @property {string} sym - Waypoint symbol descriptor (e.g. 'Food', 'Summit', 'Water')
 * @property {string} desc - Waypoint description or note
 * @property {string} typeStr - Waypoint category/type string
 */

/**
 * @typedef {Object} GpxParseResult
 * @property {string} title - Route title extracted from metadata or track name
 * @property {GpxCoordinate[]} coords - Ordered array of route GPS coordinates with elevation
 * @property {GpxRawWaypoint[]} rawWaypoints - Array of raw waypoints extracted from `<wpt>` nodes
 */

/**
 * Central registry of route file parsers.
 * Modular architecture designed to allow effortless addition of formats
 * like .fit, .geojson, and .kml without modifying downstream signal or rendering engines.
 */
export const PARSERS = [
  {
    id: 'gpx',
    name: 'GPX (GPS Exchange Format)',
    extensions: ['.gpx'],
    mimeType: 'application/gpx+xml',
    isBinary: false,
    sniff: (content) => typeof content === 'string' && /<gpx[\s>]/i.test(content),
    parse: (content) => parseGPX(content)
  },
  {
    id: 'tcx',
    name: 'TCX (Training Center XML)',
    extensions: ['.tcx'],
    mimeType: 'application/vnd.garmin.tcx+xml',
    isBinary: false,
    sniff: (content) => typeof content === 'string' && /<TrainingCenterDatabase[\s>]/i.test(content),
    parse: (content) => parseTCX(content)
  },
  {
    id: 'fit',
    name: 'FIT (Flexible and Interoperable Data Transfer)',
    extensions: ['.fit'],
    mimeType: 'application/octet-stream',
    isBinary: true,
    sniff: (content) => isFitBuffer(content),
    parse: (content, fileName) => parseFIT(content, fileName)
  }
];

/**
 * Registers a new parser into the system (e.g. for future .fit support).
 *
 * @param {Object} parserDef - Parser definition
 * @param {string} parserDef.id - Unique format ID (e.g. 'fit')
 * @param {string} parserDef.name - Human-readable format name
 * @param {string[]} parserDef.extensions - Array of file extensions with leading dot (e.g. ['.fit'])
 * @param {boolean} [parserDef.isBinary=false] - Whether content is ArrayBuffer
 * @param {function(string|ArrayBuffer): boolean} [parserDef.sniff] - Sniffer function
 * @param {function(string|ArrayBuffer, string=): GpxParseResult} parserDef.parse - Parser function
 */
export function registerParser(parserDef) {
  if (!parserDef || !parserDef.id || typeof parserDef.parse !== 'function') {
    throw new Error('Invalid parser definition: id and parse function are required.');
  }
  const idx = PARSERS.findIndex(p => p.id === parserDef.id);
  if (idx >= 0) {
    PARSERS[idx] = parserDef;
  } else {
    PARSERS.push(parserDef);
  }
}

/**
 * Returns an array of all currently supported file extensions.
 *
 * @returns {string[]} Supported extensions (e.g. ['.gpx', '.tcx'])
 */
export function getSupportedExtensions() {
  return PARSERS.flatMap(p => p.extensions);
}

/**
 * Checks whether a given file name corresponds to a binary format (e.g. .fit).
 *
 * @param {string} fileName - Name of file
 * @returns {boolean} True if binary, false if text
 */
export function isBinaryExtension(fileName = '') {
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
  const parser = PARSERS.find(p => p.extensions.includes(ext));
  return parser ? Boolean(parser.isBinary) : false;
}

/**
 * Finds the appropriate parser for a given file name or content.
 *
 * @param {string} fileName - File name or path
 * @param {string|ArrayBuffer} [content] - Optional file content for sniffing
 * @returns {Object|null} Matching parser definition or null
 */
export function getParserForFile(fileName = '', content = null) {
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
  let parser = PARSERS.find(p => p.extensions.includes(ext));
  if (parser) return parser;

  if (content) {
    parser = PARSERS.find(p => typeof p.sniff === 'function' && p.sniff(content));
    if (parser) return parser;
  }

  return null;
}

/**
 * High-level unified dispatcher that parses any supported route file format.
 *
 * @param {string|ArrayBuffer} content - Raw file content (text or binary ArrayBuffer)
 * @param {string} [fileName=''] - File name (used for format resolution and fallback title)
 * @returns {GpxParseResult} Parsed route metadata, coordinate array, and waypoints
 * @throws {Error} When format is unsupported or parsing fails
 */
export function parseRouteFile(content, fileName = '') {
  const parser = getParserForFile(fileName, content);
  if (parser) {
    return parser.parse(content, fileName);
  }

  // Fallback sniffing for text files
  if (typeof content === 'string') {
    for (const p of PARSERS) {
      if (!p.isBinary && typeof p.sniff === 'function' && p.sniff(content)) {
        return p.parse(content, fileName);
      }
    }
  } else if (isFitBuffer(content)) {
    return parseFIT(content, fileName);
  }

  const supported = getSupportedExtensions().join(', ');
  throw new Error(`Unsupported route file format (${fileName || 'unknown'}). Supported extensions: ${supported}`);
}
