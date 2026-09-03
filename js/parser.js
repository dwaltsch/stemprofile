/**
 * GPX Parser Module
 *
 * Lightweight, zero-dependency parser using the browser's native DOMParser API.
 * Ingests GPX XML documents, extracts track elevation profiles, and identifies
 * embedded race waypoints, feed cues, summits, and intermediate sprints.
 *
 * @module parser
 */

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
 * Parses raw GPX XML string into structured coordinates and waypoints.
 *
 * Supports tracks (`<trkpt>`), routes (`<rtept>`), and standalone waypoints (`<wpt>`).
 * Handles missing elevation gracefully by forward-filling previous known elevation.
 *
 * @param {string} xmlText - Raw GPX XML content string
 * @returns {GpxParseResult} Parsed route metadata, coordinate array, and waypoints
 * @throws {Error} When XML syntax is invalid or no trackpoints are found
 */
/**
 * Parses raw decimal numbers from coordinate attributes or text content,
 * normalizing comma decimals (e.g. '450,5' -> 450.5).
 *
 * @param {string|number|null|undefined} val - Raw value
 * @returns {number} Parsed float number or NaN
 */
function parseDecimal(val) {
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return val;
  const str = String(val).trim().replace(',', '.');
  return parseFloat(str);
}

/**
 * Finds all descendant elements matching one or more local tag names (ignoring XML namespaces and case).
 *
 * @param {Document|Element} parent - Parent node
 * @param {string[]} tagNames - Array of local tag names (lowercase)
 * @returns {Element[]} Array of matching elements
 */
function findElementsByLocalNames(parent, ...tagNames) {
  if (!parent) return [];
  const targetSet = new Set(tagNames.map(t => t.toLowerCase()));
  const matches = [];

  const traverse = (node) => {
    if (!node) return;
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const local = (child.localName || child.tagName || '').replace(/^.*:/, '').toLowerCase();
      if (targetSet.has(local)) {
        matches.push(child);
      }
      traverse(child);
    }
  };

  traverse(parent);
  return matches;
}

/**
 * Finds direct child text content matching a local tag name (ignoring namespace and case).
 *
 * @param {Element} parent - Parent element
 * @param {string} tagName - Local tag name to match
 * @returns {string} Trimmed text content
 */
function findChildText(parent, tagName) {
  if (!parent) return '';
  const target = tagName.toLowerCase();
  const children = parent.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const local = (child.localName || child.tagName || '').replace(/^.*:/, '').toLowerCase();
    if (local === target) {
      return (child.textContent || '').trim();
    }
  }
  return '';
}

/**
 * Finds text content of the first descendant element matching a local tag name (ignoring namespace and case).
 *
 * @param {Element|Document} parent - Parent node
 * @param {string} tagName - Local tag name to match
 * @returns {string} Trimmed text content
 */
function getFirstElementText(parent, tagName) {
  const matches = findElementsByLocalNames(parent, tagName);
  return matches.length > 0 ? (matches[0].textContent || '').trim() : '';
}


/**
 * Gets element attribute value case-insensitively.
 *
 * @param {Element} node - DOM element
 * @param {string} name - Attribute name
 * @returns {string|null} Attribute value or null
 */
function getAttr(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return null;
  const direct = node.getAttribute(name);
  if (direct !== null) return direct;
  return node.getAttribute(name.toLowerCase()) || node.getAttribute(name.toUpperCase());
}

/**
 * Parses raw GPX XML string into structured coordinates and waypoints.
 *
 * Supports tracks (`<trkpt>`), routes (`<rtept>`), and standalone waypoints (`<wpt>`).
 * Handles missing elevation gracefully by forward-filling previous known elevation.
 *
 * @param {string} xmlText - Raw GPX XML content string
 * @returns {GpxParseResult} Parsed route metadata, coordinate array, and waypoints
 * @throws {Error} When XML syntax is invalid or no trackpoints are found
 */
export function parseGPX(xmlText) {
  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(xmlText, "text/xml");

  // Check for XML parsing syntax errors
  const parseErrors = findElementsByLocalNames(xmlDoc, "parsererror");
  if (parseErrors.length > 0) {
    throw new Error("Invalid GPX XML syntax: " + parseErrors[0].textContent);
  }

  // 1. Extract track or route title: metadata > name -> trk > name -> rte > name -> default
  let title = "StemProfile";
  const metaNodes = findElementsByLocalNames(xmlDoc, "metadata");
  const trkNodes = findElementsByLocalNames(xmlDoc, "trk");
  const rteNodes = findElementsByLocalNames(xmlDoc, "rte");

  let extractedTitle = '';
  if (metaNodes.length > 0) {
    extractedTitle = findChildText(metaNodes[0], "name");
  }
  if (!extractedTitle && trkNodes.length > 0) {
    extractedTitle = findChildText(trkNodes[0], "name");
  }
  if (!extractedTitle && rteNodes.length > 0) {
    extractedTitle = findChildText(rteNodes[0], "name");
  }
  if (extractedTitle) {
    title = extractedTitle;
  }

  // 2. Extract trackpoints with fallback priority: <trkpt> -> <rtept> -> <wpt>
  let ptNodes = findElementsByLocalNames(xmlDoc, "trkpt");
  if (ptNodes.length === 0) ptNodes = findElementsByLocalNames(xmlDoc, "rtept");
  if (ptNodes.length === 0) ptNodes = findElementsByLocalNames(xmlDoc, "wpt");

  if (ptNodes.length === 0) {
    throw new Error("No trackpoints (<trkpt>, <rtept>, <wpt>) found in GPX file.");
  }

  const coords = [];
  for (let i = 0; i < ptNodes.length; i++) {
    const node = ptNodes[i];
    const lat = parseDecimal(getAttr(node, "lat"));
    const lon = parseDecimal(getAttr(node, "lon"));
    const eleNodes = findElementsByLocalNames(node, "ele");

    // Forward-fill elevation if specific point is missing <ele> tag
    const ele = eleNodes.length > 0 
      ? parseDecimal(eleNodes[0].textContent) 
      : (coords.length > 0 ? coords[coords.length - 1].ele : 0);

    if (!isNaN(lat) && !isNaN(lon) && !isNaN(ele)) {
      coords.push({ lat, lon, ele });
    }
  }

  if (coords.length < 2) {
    throw new Error("GPX file must contain at least 2 valid coordinates.");
  }

  // 3. Extract separate race waypoints (<wpt>) when trackpoints are present
  const rawWaypoints = [];
  const hasTrackElements = findElementsByLocalNames(xmlDoc, "trkpt", "rtept").length > 0;
  if (hasTrackElements) {
    const wptNodes = findElementsByLocalNames(xmlDoc, "wpt");
    for (let i = 0; i < wptNodes.length; i++) {
      const node = wptNodes[i];
      const lat = parseDecimal(getAttr(node, "lat"));
      const lon = parseDecimal(getAttr(node, "lon"));

      const name = findChildText(node, "name");
      const sym = findChildText(node, "sym");
      const desc = findChildText(node, "desc");
      const typeStr = findChildText(node, "type");

      if (!isNaN(lat) && !isNaN(lon)) {
        rawWaypoints.push({ lat, lon, name, sym, desc, typeStr });
      }
    }
  }

  return { title, coords, rawWaypoints };
}

/**
 * Parses raw TCX XML string into structured coordinates and waypoints.
 *
 * Supports Courses (`<Courses><Course>`) and Activities (`<Activities><Activity>`),
 * extracting `<Trackpoint>` nodes (with nested `<Position>` and `<AltitudeMeters>`)
 * and `<CoursePoint>` waypoints (names, types, coordinates, and notes).
 * Handles missing elevation gracefully by forward-filling previous known elevation.
 *
 * @param {string} xmlText - Raw TCX XML content string
 * @returns {GpxParseResult} Parsed route metadata, coordinate array, and waypoints
 * @throws {Error} When XML syntax is invalid or no trackpoints are found
 */
export function parseTCX(xmlText) {
  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(xmlText, "text/xml");

  // Check for XML parsing syntax errors
  const parseErrors = findElementsByLocalNames(xmlDoc, "parsererror");
  if (parseErrors.length > 0) {
    throw new Error("Invalid TCX XML syntax: " + parseErrors[0].textContent);
  }

  // 1. Extract course or activity title
  let title = "StemProfile";
  const courseNodes = findElementsByLocalNames(xmlDoc, "course");
  const activityNodes = findElementsByLocalNames(xmlDoc, "activity");

  if (courseNodes.length > 0) {
    const courseName = getFirstElementText(courseNodes[0], "name");
    if (courseName) title = courseName;
  } else if (activityNodes.length > 0) {
    const actNotes = getFirstElementText(activityNodes[0], "notes");
    const actId = getFirstElementText(activityNodes[0], "id");
    if (actNotes) {
      title = actNotes;
    } else if (actId) {
      title = actId;
    }
  }

  // 2. Extract trackpoints from all tracks across courses/activities
  const ptNodes = findElementsByLocalNames(xmlDoc, "trackpoint");
  if (ptNodes.length === 0) {
    throw new Error("No trackpoints (<Trackpoint>) found in TCX file.");
  }

  const coords = [];
  for (let i = 0; i < ptNodes.length; i++) {
    const node = ptNodes[i];
    const latStr = getFirstElementText(node, "latitudedegrees");
    const lonStr = getFirstElementText(node, "longitudedegrees");

    // Skip trackpoints without GPS coordinate fixes (e.g. sensor/pause trackpoints)
    if (!latStr || !lonStr) continue;

    const lat = parseDecimal(latStr);
    const lon = parseDecimal(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleStr = getFirstElementText(node, "altitudemeters");
    const parsedEle = eleStr ? parseDecimal(eleStr) : NaN;

    // Forward-fill elevation if specific point is missing or invalid
    const ele = !isNaN(parsedEle)
      ? parsedEle
      : (coords.length > 0 ? coords[coords.length - 1].ele : 0);

    coords.push({ lat, lon, ele });
  }

  if (coords.length < 2) {
    throw new Error("TCX file must contain at least 2 valid coordinates with GPS positions.");
  }

  // 3. Extract embedded CoursePoint nodes (Aid stations, water stops, summits, cautions)
  const rawWaypoints = [];
  const cpNodes = findElementsByLocalNames(xmlDoc, "coursepoint");
  for (let i = 0; i < cpNodes.length; i++) {
    const node = cpNodes[i];
    const latStr = getFirstElementText(node, "latitudedegrees");
    const lonStr = getFirstElementText(node, "longitudedegrees");
    if (!latStr || !lonStr) continue;

    const lat = parseDecimal(latStr);
    const lon = parseDecimal(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const name = getFirstElementText(node, "name");
    const pointType = getFirstElementText(node, "pointtype");
    const notes = getFirstElementText(node, "notes");

    rawWaypoints.push({
      lat,
      lon,
      name: name || pointType || "Waypoint",
      sym: pointType || "",
      desc: notes || "",
      typeStr: pointType || ""
    });
  }

  return { title, coords, rawWaypoints };
}

/**
 * Garmin FIT Course Point Type enum mapping.
 * Translates numeric course point IDs into human-readable descriptors.
 */
export const FIT_COURSE_POINT_TYPES = {
  0: 'Generic',
  1: 'Summit',
  2: 'Valley',
  3: 'Water',
  4: 'Food',
  5: 'Danger',
  6: 'Left',
  7: 'Right',
  8: 'Straight',
  9: 'First Aid',
  10: 'Category 4',
  11: 'Category 3',
  12: 'Category 2',
  13: 'Category 1',
  14: 'Hors Category',
  15: 'Sprint',
  16: 'Left Fork',
  17: 'Right Fork',
  18: 'Middle Fork',
  19: 'Slight Left',
  20: 'Sharp Left',
  21: 'Slight Right',
  22: 'Sharp Right',
  23: 'U-Turn',
  24: 'Segment Start',
  25: 'Segment End',
  27: 'Campsite',
  28: 'Aid Station',
  29: 'Rest Area'
};

/**
 * Checks whether the given buffer or view contains a valid Garmin FIT file header.
 *
 * @param {ArrayBuffer|ArrayBufferView} content - Binary content
 * @returns {boolean} True if content has a valid .FIT header signature
 */
export function isFitBuffer(content) {
  if (!content) return false;
  let view;
  if (content instanceof ArrayBuffer) {
    view = new DataView(content);
  } else if (ArrayBuffer.isView(content)) {
    view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  } else {
    return false;
  }
  if (view.byteLength < 14) return false;
  const headerSize = view.getUint8(0);
  if (headerSize < 12 || headerSize > 32) return false;
  return (
    view.getUint8(8) === 0x2E && // '.'
    view.getUint8(9) === 0x46 && // 'F'
    view.getUint8(10) === 0x49 && // 'I'
    view.getUint8(11) === 0x54    // 'T'
  );
}

/**
 * Safely decodes a null-terminated string from a DataView slice.
 *
 * @param {DataView} view - Source view
 * @param {number} offset - Byte offset
 * @param {number} size - Maximum field size in bytes
 * @returns {string} Decoded string
 */
function decodeFitString(view, offset, size) {
  let end = offset;
  while (end < offset + size && view.getUint8(end) !== 0) {
    end++;
  }
  if (end === offset) return '';
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset);
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes).trim();
  }
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str.trim();
}

/**
 * Parses raw Garmin FIT binary course or activity file into structured coordinates and waypoints.
 *
 * 100% zero-dependency binary protocol implementation using native DataView.
 * Extracts course metadata, GPS trackpoint records (converting semicircles to decimal degrees),
 * elevation profiles (with scale/offset conversion and forward-filling), and course point waypoints.
 * Supports both Little-Endian and Big-Endian architectures, developer data fields, and compressed headers.
 *
 * @param {ArrayBuffer|ArrayBufferView} buffer - Raw FIT binary buffer
 * @param {string} [fileName=''] - File name for fallback title extraction
 * @returns {GpxParseResult} Parsed route metadata, coordinate array, and waypoints
 * @throws {Error} When FIT syntax is invalid or no trackpoints are found
 */
export function parseFIT(buffer, fileName = '') {
  if (!buffer) throw new Error('No FIT data provided.');
  let view;
  if (buffer instanceof ArrayBuffer) {
    view = new DataView(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    throw new Error('Invalid FIT buffer type: expected ArrayBuffer or TypedArray.');
  }

  const totalLen = view.byteLength;
  if (totalLen < 12) {
    throw new Error('File too small to be a valid FIT file.');
  }

  let offset = 0;
  let title = '';
  const coords = [];
  const rawWaypoints = [];

  while (offset + 12 <= totalLen) {
    const headerSize = view.getUint8(offset);
    if (headerSize < 12 || offset + headerSize > totalLen) break;

    const magic = String.fromCharCode(
      view.getUint8(offset + 8),
      view.getUint8(offset + 9),
      view.getUint8(offset + 10),
      view.getUint8(offset + 11)
    );

    if (magic !== '.FIT') {
      if (offset === 0) {
        throw new Error('Invalid FIT file: missing .FIT signature in header.');
      }
      break;
    }

    const dataSize = view.getUint32(offset + 4, true);
    const dataEnd = Math.min(offset + headerSize + dataSize, totalLen);
    let cur = offset + headerSize;

    const definitions = new Map();

    while (cur < dataEnd) {
      const recHeader = view.getUint8(cur);
      cur += 1;

      const isCompressed = (recHeader & 0x80) !== 0;
      let isDef = false;
      let hasDevData = false;
      let localMsgType = 0;

      if (isCompressed) {
        localMsgType = (recHeader >> 5) & 0x03;
      } else {
        isDef = (recHeader & 0x40) !== 0;
        hasDevData = (recHeader & 0x20) !== 0;
        localMsgType = recHeader & 0x0F;
      }

      if (isDef) {
        if (cur + 5 > dataEnd) break;
        cur += 1; // reserved
        const arch = view.getUint8(cur); cur += 1;
        const isLE = arch === 0;
        const globalMsgNum = view.getUint16(cur, isLE); cur += 2;
        const numFields = view.getUint8(cur); cur += 1;

        const fields = [];
        let totalMsgDataSize = 0;
        for (let i = 0; i < numFields; i++) {
          if (cur + 3 > dataEnd) break;
          const fieldDefNum = view.getUint8(cur);
          const size = view.getUint8(cur + 1);
          const baseType = view.getUint8(cur + 2);
          cur += 3;
          fields.push({ fieldDefNum, size, baseType });
          totalMsgDataSize += size;
        }

        let devDataSize = 0;
        if (hasDevData && cur < dataEnd) {
          const numDevFields = view.getUint8(cur); cur += 1;
          for (let i = 0; i < numDevFields; i++) {
            if (cur + 3 > dataEnd) break;
            const devSize = view.getUint8(cur + 1);
            cur += 3;
            devDataSize += devSize;
          }
        }

        definitions.set(localMsgType, {
          globalMsgNum,
          isLE,
          fields,
          totalDataSize: totalMsgDataSize + devDataSize
        });
      } else {
        const def = definitions.get(localMsgType);
        if (!def) {
          break; // Cannot decode without known definition
        }

        if (cur + def.totalDataSize > dataEnd) {
          break; // Truncated record
        }

        const isLE = def.isLE;

        if (def.globalMsgNum === 6) { // Course Message
          let fOffset = cur;
          for (const f of def.fields) {
            if (f.fieldDefNum === 4) { // name
              const courseName = decodeFitString(view, fOffset, f.size);
              if (courseName) title = courseName;
            }
            fOffset += f.size;
          }
        } else if (def.globalMsgNum === 19) { // Record Message
          let fOffset = cur;
          let latSint = null;
          let lonSint = null;
          let altMeters = NaN;

          for (const f of def.fields) {
            if (f.fieldDefNum === 0 && f.size === 4) { // position_lat (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF && raw !== 0) latSint = raw;
            } else if (f.fieldDefNum === 1 && f.size === 4) { // position_long (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF && raw !== 0) lonSint = raw;
            } else if (f.fieldDefNum === 73 && f.size === 4) { // enhanced_altitude (uint32)
              const raw = view.getUint32(fOffset, isLE);
              if (raw !== 0xFFFFFFFF) altMeters = (raw / 5) - 500;
            } else if (f.fieldDefNum === 2 && f.size === 2 && isNaN(altMeters)) { // altitude (uint16)
              const raw = view.getUint16(fOffset, isLE);
              if (raw !== 0xFFFF) altMeters = (raw / 5) - 500;
            }
            fOffset += f.size;
          }

          if (latSint !== null && lonSint !== null) {
            // Convert semicircles to decimal degrees
            const lat = latSint * (180 / 2147483648);
            const lon = lonSint * (180 / 2147483648);
            const ele = !isNaN(altMeters)
              ? altMeters
              : (coords.length > 0 ? coords[coords.length - 1].ele : 0);

            coords.push({ lat, lon, ele });
          }
        } else if (def.globalMsgNum === 32) { // Course Point Message
          let fOffset = cur;
          let latSint = null;
          let lonSint = null;
          let cpType = 0;
          let cpName = '';

          for (const f of def.fields) {
            if (f.fieldDefNum === 2 && f.size === 4) { // position_lat (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF) latSint = raw;
            } else if (f.fieldDefNum === 3 && f.size === 4) { // position_long (sint32)
              const raw = view.getInt32(fOffset, isLE);
              if (raw !== 0x7FFFFFFF) lonSint = raw;
            } else if (f.fieldDefNum === 5 && f.size === 1) { // type (enum)
              cpType = view.getUint8(fOffset);
            } else if (f.fieldDefNum === 6) { // name (string)
              cpName = decodeFitString(view, fOffset, f.size);
            }
            fOffset += f.size;
          }

          if (latSint !== null && lonSint !== null) {
            const lat = latSint * (180 / 2147483648);
            const lon = lonSint * (180 / 2147483648);
            const typeLabel = FIT_COURSE_POINT_TYPES[cpType] || 'Point';
            rawWaypoints.push({
              lat,
              lon,
              name: cpName || typeLabel,
              sym: typeLabel,
              desc: typeLabel,
              typeStr: typeLabel
            });
          }
        }

        cur += def.totalDataSize;
      }
    }

    offset = dataEnd;
  }

  if (coords.length < 2) {
    throw new Error('FIT file must contain at least 2 valid coordinates with GPS positions.');
  }

  const cleanFallback = fileName ? fileName.replace(/\.[^.]+$/i, '') : '';
  return {
    title: title || cleanFallback || 'StemProfile',
    coords,
    rawWaypoints
  };
}

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



