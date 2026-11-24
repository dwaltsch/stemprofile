/**
 * Distance-domain smoothing, gradients and climbing totals.
 *
 * Every filter here works on metres along the route, not on point counts, so a
 * route gives the same numbers whether it was recorded every metre (head unit,
 * 1 s logging) or drawn every 100 m (route planner).
 *
 * The elevation profile is treated as piecewise linear between points, which
 * keeps the results exact for any spacing and lets every filter run in O(N).
 *
 * @module signal/smooth
 */

/** Metres of smoothing window per step of the `smoothingWindow` setting (default 7 → 105 m). */
export const SMOOTHING_M_PER_STEP = 15;
/** Half-width of the baseline a point gradient is measured over (100 m total). */
export const GRADE_HALF_WINDOW_M = 50;
/** Span the steepest sustained pitch is measured over, and the shortest span accepted near the route end. */
export const SUSTAINED_SPAN_M = 50;
export const SUSTAINED_MIN_SPAN_M = 30;
/** Elevation change that must build up in one direction before it counts as gain / loss. */
export const GAIN_THRESHOLD_M = 2;

/**
 * Smoothing window length in metres for a `smoothingWindow` setting value.
 *
 * @param {number} setting - Setting value (1 to 21)
 * @returns {number} Window length in metres
 */
export function smoothingWindowM(setting) {
  return Math.max(1, Number(setting) || 1) * SMOOTHING_M_PER_STEP;
}

/**
 * Running integral of a piecewise-linear signal: I[i] = ∫ v(x) dx from dists[0] to dists[i].
 *
 * @param {ArrayLike<number>} dists - Non-decreasing distances
 * @param {ArrayLike<number>} values - Signal values at those distances
 * @returns {Float64Array}
 */
function runningIntegral(dists, values) {
  const out = new Float64Array(dists.length);
  for (let i = 1; i < dists.length; i++) {
    out[i] = out[i - 1] + (dists[i] - dists[i - 1]) * (values[i] + values[i - 1]) / 2;
  }
  return out;
}

/**
 * A cursor that evaluates a piecewise-linear signal (and its integral) at
 * non-decreasing query distances in amortised O(1).
 */
function makeCursor(dists, values, integral) {
  const last = dists.length - 1;
  let k = 0;
  const seek = d => {
    while (k < last - 1 && dists[k + 1] <= d) k++;
    return k;
  };
  return {
    valueAt(d) {
      if (d <= dists[0]) return values[0];
      if (d >= dists[last]) return values[last];
      const i = seek(d);
      const span = dists[i + 1] - dists[i];
      const r = span > 0 ? (d - dists[i]) / span : 0;
      return values[i] + r * (values[i + 1] - values[i]);
    },
    integralAt(d) {
      if (d <= dists[0]) return 0;
      if (d >= dists[last]) return integral[last];
      const i = seek(d);
      const dx = d - dists[i];
      const span = dists[i + 1] - dists[i];
      const v = span > 0 ? values[i] + (dx / span) * (values[i + 1] - values[i]) : values[i];
      return integral[i] + dx * (values[i] + v) / 2;
    }
  };
}

/**
 * Moving average over a distance window: each point becomes the mean elevation
 * of the route within ±windowM/2 of it (truncated at the route ends).
 *
 * @param {ArrayLike<number>} dists - Non-decreasing distances in metres
 * @param {ArrayLike<number>} values - Elevations in metres
 * @param {number} windowM - Full window length in metres
 * @returns {number[]} Smoothed elevations, one per point
 */
export function smoothByDistance(dists, values, windowM) {
  const N = dists.length;
  if (N < 2 || !(windowM > 0)) return Array.from(values);
  const half = windowM / 2;
  const integral = runningIntegral(dists, values);
  const lo = makeCursor(dists, values, integral);
  const hi = makeCursor(dists, values, integral);
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.max(dists[0], dists[i] - half);
    const b = Math.min(dists[N - 1], dists[i] + half);
    const ia = lo.integralAt(a);
    const ib = hi.integralAt(b);
    out[i] = b - a > 1e-9 ? (ib - ia) / (b - a) : values[i];
  }
  return out;
}

/**
 * Gradient (%) at each point, measured on the profile over ±halfM around it
 * (truncated at the route ends) and clamped to ±maxPct.
 *
 * @param {ArrayLike<number>} dists - Non-decreasing distances in metres
 * @param {ArrayLike<number>} eles - (Smoothed) elevations in metres
 * @param {number} halfM - Half baseline in metres
 * @param {number} [maxPct=35] - Physical clamp
 * @returns {number[]} Gradients in percent
 */
export function gradesByDistance(dists, eles, halfM, maxPct = 35) {
  const N = dists.length;
  const out = new Array(N).fill(0);
  if (N < 2 || !(halfM > 0)) return out;
  const lo = makeCursor(dists, eles, null);
  const hi = makeCursor(dists, eles, null);
  for (let i = 0; i < N; i++) {
    const a = Math.max(dists[0], dists[i] - halfM);
    const b = Math.min(dists[N - 1], dists[i] + halfM);
    if (b - a <= 1e-9) continue;
    const g = ((hi.valueAt(b) - lo.valueAt(a)) / (b - a)) * 100;
    out[i] = Number.isFinite(g) ? Math.max(-maxPct, Math.min(maxPct, g)) : 0;
  }
  return out;
}

/**
 * Total climbing and descending with hysteresis: a change only counts once the
 * profile has moved thresholdM in one direction, so sensor jitter adds nothing
 * while every real rise and drop counts in full (peak to valley).
 *
 * @param {ArrayLike<number>} eles - Elevations in metres
 * @param {number} [thresholdM=GAIN_THRESHOLD_M]
 * @returns {{ gain: number, loss: number }}
 */
export function climbingTotals(eles, thresholdM = GAIN_THRESHOLD_M) {
  let gain = 0;
  let loss = 0;
  if (!eles || eles.length < 2) return { gain, loss };
  let anchor = eles[0]; // last committed turning point
  let peak = anchor;
  let trough = anchor;
  let dir = 0; // 0 undecided, 1 rising, -1 falling
  for (let i = 1; i < eles.length; i++) {
    const e = eles[i];
    if (dir === 0) {
      // Undecided: wait for the first move of thresholdM, measured from the
      // lowest / highest point so far (wiggles smaller than that are jitter)
      if (e > peak) peak = e;
      if (e < trough) trough = e;
      if (e - trough >= thresholdM) {
        anchor = trough;
        peak = e;
        dir = 1;
      } else if (peak - e >= thresholdM) {
        anchor = peak;
        trough = e;
        dir = -1;
      }
    } else if (dir === 1) {
      if (e > peak) peak = e;
      else if (peak - e >= thresholdM) {
        gain += peak - anchor;
        anchor = peak;
        trough = e;
        dir = -1;
      }
    } else {
      if (e < trough) trough = e;
      else if (e - trough >= thresholdM) {
        loss += anchor - trough;
        anchor = trough;
        peak = e;
        dir = 1;
      }
    }
  }
  if (dir === 1) gain += peak - anchor;
  else if (dir === -1) loss += anchor - trough;
  return { gain, loss };
}

/**
 * Steepest sustained ascent (%) over spans of about spanM that start between
 * two point indices (a span may run past `to`, so a climb's value never exceeds
 * the route's).
 *
 * @param {ArrayLike<number>} dists - Non-decreasing distances in metres
 * @param {ArrayLike<number>} eles - Smoothed elevations in metres
 * @param {number} spanM - Span to measure over
 * @param {number} minSpanM - Shortest span accepted (near the route end)
 * @param {number} [from=0] - First span start index
 * @param {number} [to=dists.length-1] - Last span start index
 * @returns {number} Steepest ascent in percent (0 when none)
 */
export function maxSustainedAscent(dists, eles, spanM, minSpanM, from = 0, to = dists.length - 1) {
  const last = dists.length - 1;
  let best = 0;
  let j = from;
  for (let i = from; i <= to; i++) {
    if (j < i) j = i;
    while (j < last && dists[j] - dists[i] < spanM) j++;
    const spanD = dists[j] - dists[i];
    if (spanD < minSpanM) continue;
    const g = ((eles[j] - eles[i]) / spanD) * 100;
    if (Number.isFinite(g) && g > best) best = g;
  }
  return best;
}
