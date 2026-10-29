/**
 * Projects raw GPX waypoints onto the route and classifies them into race cue types.
 *
 * @module signal/waypoint-match
 */

import { calcHaversine } from './geo.js';
import { normalizeCoordinates } from '../units.js';

/**
 * Matches raw GPX waypoints to track distances and infers waypoint types for racing.
 *
 * Scans waypoint labels, descriptions, and symbol attributes using multilingual
 * regex keywords to automatically assign categories:
 * - 'feed' (Feed zone / Ravito)
 * - 'water' (Hydration / Fountain / Bidon)
 * - 'food' (Fuel / Gels / Bars)
 * - 'sprint' (Intermediate sprint / Green flag)
 * - 'summit' (Mountain pass / Col / Peak)
 * - 'caution' (Hazards / Cobbles / Sharp descent)
 * - 'mech' (Tech support / Bike service)
 * - 'checkpoint' (Timing check / Control point)
 *
 * @param {GpxRawWaypoint[]} rawWaypoints - Raw waypoints from GPX file
 * @param {GpxCoordinate[]} coords - Route track GPS coordinates
 * @param {ProfilePoint[]} points - Processed profile points
 * @returns {Array<{ id: string, distM: number, type: string, label: string, enabled: boolean }>}
 */
export function matchWaypointsToTrack(rawWaypoints, coords, points) {
  if (!rawWaypoints || rawWaypoints.length === 0 || !coords || coords.length < 2 || !points || points.length < 2) {
    return [];
  }

  const normCoords = normalizeCoordinates(coords);

  const results = [];
  const totalDist = points[points.length - 1].dist;
  const N = normCoords.length;
  const isLoop = N >= 2 && calcHaversine(normCoords[0].lat, normCoords[0].lon, normCoords[N - 1].lat, normCoords[N - 1].lon) <= 1000;

  rawWaypoints.forEach((wpt, index) => {
    let bestDistM = 0;
    let minDistToTrack = Infinity;

    for (let i = 0; i < N; i++) {
      const d = calcHaversine(wpt.lat, wpt.lon, normCoords[i].lat, normCoords[i].lon);
      if (d < minDistToTrack) {
        minDistToTrack = d;
        bestDistM = points[i] ? points[i].dist : 0;
      }
    }

    // On loop routes, if a waypoint is near both start and finish, match to finish unless explicitly named start
    if (isLoop && minDistToTrack <= 5000) {
      const dToStart = calcHaversine(wpt.lat, wpt.lon, normCoords[0].lat, normCoords[0].lon);
      const dToEnd = calcHaversine(wpt.lat, wpt.lon, normCoords[N - 1].lat, normCoords[N - 1].lon);
      const combinedText = `${wpt.name} ${wpt.sym} ${wpt.desc} ${wpt.typeStr}`.toLowerCase();
      if (dToStart <= 1000 && dToEnd <= 1000 && !/(^|\b)(start|départ|abfahrt|begin)(\b|$)/i.test(combinedText)) {
        bestDistM = totalDist;
      }
    }

    // Only include if waypoint is near the route (< 5000m)
    if (minDistToTrack <= 5000) {
      const combinedText = `${wpt.name} ${wpt.sym} ${wpt.desc} ${wpt.typeStr}`.toLowerCase();
      let inferredType = 'feed';

      if (/(water|h2o|bottle|drink|fountain|source|bidon|eau|wasser)/i.test(combinedText)) {
        inferredType = 'water';
      } else if (/(feed|ravito|verpflegung|aid|zone|resupply|refreshment)/i.test(combinedText)) {
        inferredType = 'feed';
      } else if (/(gel|nutrition|energy|snack|bar|banana|food|bakery|cafe)/i.test(combinedText)) {
        inferredType = 'food';
      } else if (/(sprint|intermediate|hotspot|green)/i.test(combinedText)) {
        inferredType = 'sprint';
      } else if (/(summit|pass|col|peak|berg|climb|kom|qom|côte)/i.test(combinedText)) {
        inferredType = 'summit';
      } else if (/(danger|caution|hazard|gravel|pave|cobble|warning|sharp|descent)/i.test(combinedText)) {
        inferredType = 'caution';
      } else if (/(mech|repair|tech|bike|shop|service|neutral)/i.test(combinedText)) {
        inferredType = 'mech';
      } else if (/(checkpoint|cp|control|timing|timecheck|finish)/i.test(combinedText)) {
        inferredType = 'checkpoint';
      } else {
        inferredType = 'custom';
      }

      const cleanLabel = (wpt.name || wpt.sym || `WP ${index + 1}`).trim();

      results.push({
        id: `wpt-gpx-${index + 1}`,
        distM: Math.max(0, Math.min(totalDist, bestDistM)),
        type: inferredType,
        label: cleanLabel,
        enabled: true
      });
    }
  });

  results.sort((a, b) => a.distM - b.distM);
  return results;
}
