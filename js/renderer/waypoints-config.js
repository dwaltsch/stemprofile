/**
 * Waypoint category definitions (colors, short codes) and vector pin glyphs.
 *
 * @module renderer/waypoints-config
 */

/**
 * Visual styling and iconography configuration for race waypoints and nutrition cues
 */
export const WAYPOINT_CONFIG = {
  feed: {
    label: 'Feed Zone',
    color: '#f97316',      // Vivid Orange
    textColor: '#ffffff',
    shortCode: 'FEED'
  },
  water: {
    label: 'Water / H2O',
    color: '#0284c7',      // Bright Sky Blue
    textColor: '#ffffff',
    shortCode: 'H2O'
  },
  food: {
    label: 'Food / Fuel',
    color: '#eab308',      // Amber Yellow
    textColor: '#000000',
    shortCode: 'GEL'
  },
  sprint: {
    label: 'Sprint',
    color: '#16a34a',      // Emerald Green
    textColor: '#ffffff',
    shortCode: 'SPRINT'
  },
  summit: {
    label: 'Summit',
    color: '#dc2626',      // Red
    textColor: '#ffffff',
    shortCode: 'SUMMIT'
  },
  caution: {
    label: 'Caution / Hazard',
    color: '#f59e0b',      // Warning Amber
    textColor: '#000000',
    shortCode: 'CAUTION'
  },
  mech: {
    label: 'Tech / Mech',
    color: '#06b6d4',      // Cyan
    textColor: '#ffffff',
    shortCode: 'TECH'
  },
  checkpoint: {
    label: 'Checkpoint',
    color: '#9333ea',      // Purple
    textColor: '#ffffff',
    shortCode: 'CP'
  },
  custom: {
    label: 'Pin',
    color: '#db2777',      // Pink / Magenta
    textColor: '#ffffff',
    shortCode: 'PIN'
  }
};

/**
 * Generates vector glyph paths for waypoint pins.
 *
 * @param {string} type - Waypoint category type identifier
 * @param {string} [textColor='#ffffff'] - Glyph icon fill/stroke color
 * @returns {string} SVG path/polygon markup centered at origin (0,0)
 */
export function renderWaypointGlyph(type, textColor = '#ffffff') {
  switch (type) {
    case 'water':
      return `<path d="M 0,-1.3 C 0,-1.3 1.0,0.1 1.0,0.8 C 1.0,1.4 0.5,1.8 0,1.8 C -0.5,1.8 -1.0,1.4 -1.0,0.8 C -1.0,0.1 0,-1.3 0,-1.3 Z" fill="${textColor}"/>`;
    case 'food':
      return `<path d="M 0.2,-1.4 L -0.9,0.1 L 0,0.1 L -0.2,1.4 L 0.9,-0.1 L 0,-0.1 Z" fill="${textColor}"/>`;
    case 'feed':
      return `<path d="M -1.1,-0.5 L 1.1,-0.5 L 0.9,1.3 L -0.9,1.3 Z" fill="${textColor}"/><path d="M -1.1,-0.5 L 0,-1.4 L 1.1,-0.5" fill="none" stroke="${textColor}" stroke-width="0.3"/>`;
    case 'sprint':
      return `<text x="0" y="1.0" font-size="2.7" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="${textColor}">S</text>`;
    case 'summit':
      return `<polygon points="0,-1.4 1.4,1.2 -1.4,1.2" fill="${textColor}"/>`;
    case 'caution':
      return `<polygon points="0,-1.4 1.3,1.2 -1.3,1.2" fill="${textColor}"/><line x1="0" y1="-0.5" x2="0" y2="0.3" stroke="#000000" stroke-width="0.38" stroke-linecap="round"/><circle cx="0" cy="0.8" r="0.22" fill="#000000"/>`;
    case 'mech':
      return `<path d="M -0.7,-1.0 L 0.7,0.4 L 0.4,0.7 L -1.0,-0.7 Z" fill="${textColor}" stroke="${textColor}" stroke-width="0.2"/><circle cx="0.7" cy="0.7" r="0.5" fill="${textColor}"/>`;
    case 'checkpoint':
      return `<path d="M -0.8,-1.2 L 1.0,-0.7 L -0.8,-0.2 Z" fill="${textColor}"/><line x1="-0.8" y1="-1.2" x2="-0.8" y2="1.3" stroke="${textColor}" stroke-width="0.32"/>`;
    default:
      return `<circle cx="0" cy="-0.2" r="1.0" fill="${textColor}"/><line x1="0" y1="0.8" x2="0" y2="1.4" stroke="${textColor}" stroke-width="0.32"/>`;
  }
}
