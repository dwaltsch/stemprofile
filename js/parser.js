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
export function parseGPX(xmlText) {
  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(xmlText, "text/xml");

  // Check for XML parsing syntax errors
  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid GPX XML syntax: " + parseError.textContent);
  }

  // 1. Extract track or route title from metadata / trk name
  let title = "StemProfile";
  const nameNode = xmlDoc.querySelector("trk > name, metadata > name");
  if (nameNode && nameNode.textContent.trim()) {
    title = nameNode.textContent.trim();
  }

  // 2. Extract trackpoints with fallback priority: <trkpt> -> <rtept> -> <wpt>
  let ptNodes = xmlDoc.querySelectorAll("trkpt");
  if (ptNodes.length === 0) ptNodes = xmlDoc.querySelectorAll("rtept");
  if (ptNodes.length === 0) ptNodes = xmlDoc.querySelectorAll("wpt");

  if (ptNodes.length === 0) {
    throw new Error("No trackpoints (<trkpt>, <rtept>, <wpt>) found in GPX file.");
  }

  const coords = [];
  for (let i = 0; i < ptNodes.length; i++) {
    const node = ptNodes[i];
    const lat = parseFloat(node.getAttribute("lat"));
    const lon = parseFloat(node.getAttribute("lon"));
    const eleNode = node.querySelector("ele");

    // Forward-fill elevation if specific point is missing <ele> tag
    const ele = eleNode 
      ? parseFloat(eleNode.textContent) 
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
  const hasTrackElements = xmlDoc.querySelectorAll("trkpt, rtept").length > 0;
  if (hasTrackElements) {
    const wptNodes = xmlDoc.querySelectorAll("wpt");
    for (let i = 0; i < wptNodes.length; i++) {
      const node = wptNodes[i];
      const lat = parseFloat(node.getAttribute("lat"));
      const lon = parseFloat(node.getAttribute("lon"));
      const nameNode = node.querySelector("name");
      const symNode = node.querySelector("sym");
      const descNode = node.querySelector("desc");
      const typeNode = node.querySelector("type");

      const name = nameNode ? nameNode.textContent.trim() : "";
      const sym = symNode ? symNode.textContent.trim() : "";
      const desc = descNode ? descNode.textContent.trim() : "";
      const typeStr = typeNode ? typeNode.textContent.trim() : "";

      if (!isNaN(lat) && !isNaN(lon)) {
        rawWaypoints.push({ lat, lon, name, sym, desc, typeStr });
      }
    }
  }

  return { title, coords, rawWaypoints };
}

