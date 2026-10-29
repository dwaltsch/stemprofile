/**
 * Share protocol constants: default settings and the theme / waypoint-type index tables used by the binary format.
 *
 * @module share/constants
 */

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
