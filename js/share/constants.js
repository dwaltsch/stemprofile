/**
 * Share protocol constants: default settings and the theme / waypoint-type index tables used by the binary format.
 *
 * @module share/constants
 */

/** First byte of every share payload. Links in any other format are rejected (no back-compat). */
export const SHARE_PROTOCOL_VERSION = 4;

/**
 * Standard default settings dictionary used to prune redundant keys during serialization.
 */
export const DEFAULT_SETTINGS = {
  widthMm: 110,
  heightMm: 35,
  fuelingWidthMm: 35,
  fuelingHeightMm: 115,
  radiusMm: 2,
  smoothingWindow: 7,
  blockSizeM: 1000,
  showBlockPct: true,
  units: 'metric',
  theme: 'white',
  showHeader: true,
  showDistanceTicks: true,
  showElevationLabels: true,
  showClimbs: true,
  showWaypoints: true,
  showWaypointLabels: true,
  showCutGuidelines: true,
  printCopies: 2,
  hiddenClimbIds: []
};

/**
 * Allowed [min, max] for numeric settings, matching the ranges the UI offers.
 * Values from shared links or typed into number inputs are clamped to these,
 * so no setting can make rendering or printing blow up.
 */
export const SETTING_LIMITS = {
  widthMm: [20, 400],
  heightMm: [10, 200],
  fuelingWidthMm: [20, 400],
  fuelingHeightMm: [10, 200],
  radiusMm: [0, 10],
  smoothingWindow: [1, 21],
  blockSizeM: [50, 25000], // 0 (continuous mode) is also allowed
  printCopies: [1, 16]
};

/**
 * Clamps the numeric settings in a partial settings object to SETTING_LIMITS.
 * Non-finite numbers are dropped; non-numeric and unknown keys pass through unchanged.
 *
 * @param {Object} partial - Partial settings
 * @returns {Object} New object with clamped values
 */
export function clampSettings(partial) {
  const out = { ...partial };
  for (const [key, [min, max]] of Object.entries(SETTING_LIMITS)) {
    if (!(key in out)) continue;
    const val = typeof out[key] === 'string' ? parseFloat(out[key]) : out[key];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      delete out[key];
    } else if (key === 'blockSizeM' && val <= 0) {
      out[key] = 0;
    } else {
      out[key] = Math.min(max, Math.max(min, val));
    }
  }
  return out;
}

export const THEME_NAMES = ['white', 'giro', 'tour', 'gravel', 'dark', 'neon', 'prism'];
export const THEME_INDEX = {
  'white': 0,
  'giro': 1,
  'tour': 2,
  'gravel': 3,
  'dark': 4,
  'neon': 5,
  'prism': 6
};

export const WPT_TYPE_NAMES = ['feed', 'water', 'food', 'sprint', 'summit', 'caution', 'mech', 'checkpoint', 'custom'];
export const WPT_TYPE_INDEX = {
  'feed': 0,
  'water': 1,
  'food': 2,
  'sprint': 3,
  'summit': 4,
  'caution': 5,
  'mech': 6,
  'checkpoint': 7,
  'custom': 8
};

/** Fuel item types in share links (index = byte value); order is part of the link format. */
export const FUEL_TYPE_NAMES = ['gel', 'gel_high_carb', 'caff_gel', 'bottle_mix', 'bottle_super', 'bar', 'chews', 'food', 'feed_zone', 'water', 'salt', 'hc', 'caff', 'bottle'];

/** Product-default keys in share links, in link order. */
export const FUEL_DEFAULT_KEYS = ['gelCarbs', 'hcGelCarbs', 'caffGelCarbs', 'barCarbs', 'bottleCarbs', 'bottleFluidMl'];
