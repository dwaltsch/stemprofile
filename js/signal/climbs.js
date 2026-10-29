/**
 * Sustained climb detection and UCI-style categorization (HC, Cat 1-4).
 *
 * @module signal/climbs
 */

/**
 * Detects sustained categorized climbs along a route.
 *
 * Implements a peak-finding and valley-dip accumulator algorithm modeled after
 * standard Grand Tour stage roadbooks and the standard cycling difficulty index:
 *   Score = (Length_km) * (AvgGrade)^2 = (Length_m / 1000) * (AvgGrade)^2
 *
 * Standard cycling difficulty threshold brackets:
 * - Cat 4: 20 <= Score < 75 (or Gain >= 40m)
 * - Cat 3: 75 <= Score < 150 (or Gain >= 120m)
 * - Cat 2: 150 <= Score < 300 (or Gain >= 250m)
 * - Cat 1: 300 <= Score < 600 (or Gain >= 500m)
 * - HC (Hors Catégorie): Score >= 600 (or Gain >= 800m)
 *
 * @param {ProfilePoint[]} points - Filtered profile points array
 * @param {number} [minGainM=35] - Minimum required elevation gain in meters
 * @param {number} [minLengthM=500] - Minimum climb length in meters
 * @param {number} [minGradePct=3.0] - Minimum average gradient percentage
 * @returns {DetectedClimb[]} List of detected climbs ordered along the route
 */
export function detectClimbs(points, minGainM = 35, minLengthM = 500, minGradePct = 3.0) {
  const climbs = [];
  const N = points.length;
  if (N < 5) return climbs;

  let inClimb = false;
  let startIdx = 0;
  let climbPeakIdx = 0;
  let runningGain = 0;
  let dipAccumulator = 0;
  let i = 1;

  while (i < N) {
    const prevE = points[i - 1].smoothEle;
    const currE = points[i].smoothEle;
    const deltaE = currE - prevE;

    if (!inClimb) {
      // Trigger climb detection upon positive gradient onset
      if (deltaE > 0.3 && points[i].grade >= minGradePct) {
        inClimb = true;
        startIdx = i - 1;
        climbPeakIdx = i;
        runningGain = deltaE;
        dipAccumulator = 0;
      }
      i++;
    } else {
      if (currE > points[climbPeakIdx].smoothEle) {
        // New highest peak within current climb
        climbPeakIdx = i;
        runningGain += (currE - points[climbPeakIdx - 1].smoothEle);
        dipAccumulator = 0;
      } else {
        // Accumulate descent dip to identify false flats vs true downhill
        dipAccumulator += (points[i - 1].smoothEle - currE);
      }

      const distFromPeak = points[i].dist - points[climbPeakIdx].dist;
      
      // End climb if descent exceeds 25m, downhill distance > 1.2km, or reached track end
      if (dipAccumulator > 25 || distFromPeak > 1200 || i === N - 1) {
        const climbLen = points[climbPeakIdx].dist - points[startIdx].dist;
        const climbGain = points[climbPeakIdx].smoothEle - points[startIdx].smoothEle;
        const avgGrade = climbLen > 0 ? (climbGain / climbLen) * 100 : 0;

        // Standard Cycling Difficulty Index: (Distance_km) * (AvgGrade)^2
        const difficultyScore = (climbLen / 1000) * Math.pow(avgGrade, 2);

        if ((difficultyScore >= 20 || climbGain >= 40) && climbLen >= minLengthM && avgGrade >= minGradePct && climbGain >= minGainM) {
          let maxG = 0;
          for (let k = startIdx; k <= climbPeakIdx; k++) {
            if (points[k].grade > maxG) maxG = points[k].grade;
          }

          // Calibrated category brackets
          let category = 'Cat 4';
          if (difficultyScore >= 600 || climbGain >= 800) {
            category = 'HC';
          } else if (difficultyScore >= 300 || climbGain >= 500) {
            category = 'Cat 1';
          } else if (difficultyScore >= 150 || climbGain >= 250) {
            category = 'Cat 2';
          } else if (difficultyScore >= 75 || climbGain >= 120) {
            category = 'Cat 3';
          } else {
            category = 'Cat 4';
          }

          climbs.push({
            id: climbs.length + 1,
            category,
            startKm: points[startIdx].dist / 1000,
            summitKm: points[climbPeakIdx].dist / 1000,
            lengthKm: climbLen / 1000,
            gainM: Math.round(climbGain),
            summitEle: Math.round(points[climbPeakIdx].smoothEle),
            avgGrade: parseFloat(avgGrade.toFixed(1)),
            maxGrade: parseFloat(Math.min(35.0, maxG).toFixed(1))
          });
        }

        inClimb = false;
        i = Math.max(i + 1, climbPeakIdx + 1);
      } else {
        i++;
      }
    }
  }

  return climbs;
}
