/**
 * TCX (Garmin Training Center XML) parser: courses, activities and course points.
 *
 * @module parsers/tcx
 */

import { findElementsByLocalNames, getFirstElementText, parseDecimal, assertNoDoctype } from './xml-utils.js';

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
  assertNoDoctype(xmlText, 'TCX');
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
