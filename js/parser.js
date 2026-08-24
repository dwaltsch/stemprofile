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

