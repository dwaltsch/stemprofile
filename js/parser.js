/**
 * GPX Parser Module
 * Zero-dependency native DOMParser implementation
 */

export function parseGPX(xmlText) {
  const domParser = new DOMParser();
  const xmlDoc = domParser.parseFromString(xmlText, "text/xml");

  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid GPX XML syntax: " + parseError.textContent);
  }

  // Extract track or metadata name if available
  let title = "StemProfile";
  const nameNode = xmlDoc.querySelector("trk > name, metadata > name");
  if (nameNode && nameNode.textContent.trim()) {
    title = nameNode.textContent.trim();
  }

  // Extract trackpoints (fall back to rtept or wpt if trkpt is absent)
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
    const ele = eleNode ? parseFloat(eleNode.textContent) : (coords.length > 0 ? coords[coords.length - 1].ele : 0);

    if (!isNaN(lat) && !isNaN(lon) && !isNaN(ele)) {
      coords.push({ lat, lon, ele });
    }
  }

  if (coords.length < 2) {
    throw new Error("GPX file must contain at least 2 valid coordinates.");
  }

  // Extract separate waypoints (<wpt>) if trkpt or rtept were used for track
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
