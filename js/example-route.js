/**
 * Built-in demo route so visitors can try the app without a file of their own.
 * The stage is synthetic: four smooth climbs on a straight line, no real place.
 *
 * @module example-route
 */

const POINT_SPACING_KM = 0.1;
const TOTAL_KM = 150;
const CLIMBS = [[22, 420, 6], [55, 1040, 9], [92, 1500, 11], [128, 700, 6]];
const WAYPOINTS = [[72, 'Feed Zone', 'Food'], [40, 'Bottles', 'Water']];

const latAt = (km) => (40 + km * 0.008993).toFixed(6);
const eleAt = (km) => (620 + CLIMBS.reduce(
  (sum, [center, height, width]) => sum + height * Math.exp(-(((km - center) / width) ** 2)),
  0
)).toFixed(1);

/**
 * Builds the example stage as a GPX document.
 *
 * @returns {string} GPX XML
 */
export function buildExampleGpx() {
  const count = Math.round(TOTAL_KM / POINT_SPACING_KM);
  const track = Array.from({ length: count + 1 }, (_, i) => {
    const km = i * POINT_SPACING_KM;
    return `<trkpt lat="${latAt(km)}" lon="20.000000"><ele>${eleAt(km)}</ele></trkpt>`;
  }).join('');
  const waypoints = WAYPOINTS.map(([km, name, type]) =>
    `<wpt lat="${latAt(km)}" lon="20.000000"><name>${name}</name><type>${type}</type></wpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="StemProfile">${waypoints}<trk><name>Example Alpine Stage</name><trkseg>${track}</trkseg></trk></gpx>`;
}
