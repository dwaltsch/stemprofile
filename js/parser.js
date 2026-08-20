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

  return { title, coords };
}
