/**
 * GPX parser: tracks, routes and waypoints via the native DOMParser.
 *
 * @module parsers/gpx
 */

import { findChildText, findElementsByLocalNames, getAttr, parseDecimal } from './xml-utils.js';

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
