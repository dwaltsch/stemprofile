/**
 * Spatial discretization of the profile into uniform roadbook block columns with gradient zones.
 *
 * @module signal/blocks
 */

import { getInterpolatedEle } from './geo.js';

/** Upper bound on block columns per profile, whatever the requested block size. */
export const MAX_SPATIAL_BLOCKS = 2000;

/**
 * Discretizes continuous route elevation into uniform spatial block columns (e.g. 2.5km, 1.0km, 500m).
 * Mimics Grand Tour roadbook elevation profiles with exact column average gradients.
 *
 * @param {ProfilePoint[]} points - Ordered route profile points
 * @param {number} totalDist - Total distance in meters
 * @param {number} [blockSizeM=1000] - Uniform block column length in meters (0 for continuous)
 * @returns {SpatialBlock[]} Array of discretized block segments
 */
export function buildSpatialBlocks(points, totalDist, blockSizeM = 1000) {
  const requestedM = parseFloat(blockSizeM);
  if (!points || points.length < 2 || !(totalDist > 0)) return [];
  if (isNaN(requestedM) || requestedM <= 0) return []; // 0 = continuous mode
  // Hard cap on column count: beyond this, columns are sub-millimetre and only cost render time
  const numBlockSizeM = Math.max(requestedM, totalDist / MAX_SPATIAL_BLOCKS);

  const numBlocks = Math.max(1, Math.ceil(totalDist / numBlockSizeM));
  const blocks = [];

  for (let k = 0; k < numBlocks; k++) {
    const dStart = k * numBlockSizeM;
    const dEnd = Math.min(totalDist, (k + 1) * numBlockSizeM);
    const spanM = dEnd - dStart;
    if (spanM <= 0) break;

    const eStart = getInterpolatedEle(points, dStart);
    const eEnd = getInterpolatedEle(points, dEnd);

    const grade = spanM > 0 ? ((eEnd - eStart) / spanM) * 100 : 0;
    const safeGrade = isFinite(grade) ? grade : 0;
    const absGrade = Math.abs(safeGrade);

    // 4-tier pro cycling gradient classification
    let zone = 0;
    if (absGrade < 5) zone = 0;       // Zone 1: Flat / False Flat
    else if (absGrade < 8) zone = 1;  // Zone 2: Moderate Climb
    else if (absGrade < 12) zone = 2; // Zone 3: Steep Climb
    else zone = 3;                    // Zone 4: Severe Gradient

    blocks.push({
      index: k + 1,
      startDist: dStart,
      endDist: dEnd,
      lengthM: spanM,
      startEle: eStart,
      endEle: eEnd,
      grade: parseFloat(safeGrade.toFixed(1)),
      absGrade: parseFloat(absGrade.toFixed(1)),
      zone
    });
  }

  return blocks;
}
