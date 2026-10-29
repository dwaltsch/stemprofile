/**
 * Sticker color themes (gradient zones, badges, grid) and UCI climb category colors.
 *
 * @module renderer/themes
 */

/**
 * @typedef {Object} RenderTheme
 * @property {string} name - Human-readable theme name
 * @property {string} bg - Background color hex
 * @property {string} text - Primary high-contrast text color
 * @property {string} textMuted - Secondary muted text color
 * @property {string} grid - Elevation and distance grid line color
 * @property {string} topStroke - Profile skyline stroke color
 * @property {string} divider - Segment block divider line color
 * @property {string} blockStroke - Segment block border stroke color
 * @property {string} badgeBg - Climb and waypoint badge background fill
 * @property {string} badgeStroke - Climb and waypoint badge border stroke
 * @property {string} badgeText - Climb and waypoint badge text color
 * @property {string} cutLine - Scissor guideline dashed stroke color
 * @property {string} z1 - Zone 1 (<5%) color hex (Emerald Green)
 * @property {string} z2 - Zone 2 (5-8%) color hex (Amber Yellow)
 * @property {string} z3 - Zone 3 (8-12%) color hex (Deep Orange)
 * @property {string} z4 - Zone 4 (>12%) color hex (Crimson Red)
 */

/**
 * Available color themes for stickers and print exports
 * @type {Record<'white'|'dark'|'tour'|'neon'|'giro'|'gravel', RenderTheme>}
 */
export const THEMES = {
  'white': {
    name: 'Print White',
    bg: '#ffffff',
    text: '#0f172a',          // Crisp deep slate/black
    textMuted: '#334155',     // High-contrast slate 700
    grid: 'rgba(15, 23, 42, 0.16)',
    topStroke: '#0f172a',
    divider: '#ffffff',
    blockStroke: 'rgba(15, 23, 42, 0.35)',
    badgeBg: '#ffffff',
    badgeStroke: '#0f172a',
    badgeText: '#0f172a',
    cutLine: 'rgba(15, 23, 42, 0.35)',
    z1: '#16a34a',            // Emerald Green
    z2: '#d97706',            // Rich Amber
    z3: '#ea580c',            // Deep Orange
    z4: '#dc2626'             // Bold Crimson Red
  },
  'giro': {
    name: 'Giro Rosa (Gazzetta Pink)',
    bg: '#fff0f3',            // Signature Gazzetta Dello Sport warm pink paper
    text: '#4c0519',          // Deep Italian racing burgundy / espresso
    textMuted: '#881337',     // Rose Slate
    grid: 'rgba(136, 19, 55, 0.16)',
    topStroke: '#4c0519',
    divider: '#fff0f3',
    blockStroke: 'rgba(76, 5, 25, 0.35)',
    badgeBg: '#ffffff',
    badgeStroke: '#be185d',   // Iconic Maglia Rosa Magenta
    badgeText: '#4c0519',
    cutLine: 'rgba(190, 24, 93, 0.40)',
    z1: '#059669',            // Italian Alpine Mint
    z2: '#d97706',            // Tuscan Ochre
    z3: '#ea580c',            // Dolomite Terracotta
    z4: '#be123c'             // Giro Rose Crimson
  },
  'tour': {
    name: 'Tour de France (L\'Étape Gold)',
    bg: '#ffffff',
    text: '#000000',          // Pure Jet Black for 21:1 sunlight contrast
    textMuted: '#27272a',     // Asphalt Dark
    grid: 'rgba(0, 0, 0, 0.20)',
    topStroke: '#000000',
    divider: '#ffffff',
    blockStroke: 'rgba(0, 0, 0, 0.50)',
    badgeBg: '#fef08a',       // Maillot Jaune Gold Badge Fill
    badgeStroke: '#000000',
    badgeText: '#000000',
    cutLine: 'rgba(0, 0, 0, 0.45)',
    z1: '#16a34a',            // French Meadow Green
    z2: '#eab308',            // Tour Gold
    z3: '#f97316',            // Alpine Orange
    z4: '#dc2626'             // Pois Rouges Red
  },
  'gravel': {
    name: 'Gravel Brevet (Expedition Sand)',
    bg: '#f5efe6',            // Warm desert parchment / sand
    text: '#1c1917',          // Deep espresso / earth
    textMuted: '#57534e',     // Stone Slate
    grid: 'rgba(41, 37, 36, 0.18)',
    topStroke: '#292524',
    divider: '#f5efe6',
    blockStroke: 'rgba(41, 37, 36, 0.35)',
    badgeBg: '#fffbf5',
    badgeStroke: '#78350f',   // Cognac leather brown
    badgeText: '#1c1917',
    cutLine: 'rgba(120, 53, 15, 0.40)',
    z1: '#4d7c0f',            // Forest Moss / Sage
    z2: '#b45309',            // Desert Clay / Ochre
    z3: '#c2410c',            // Burnt Sienna / Rust
    z4: '#7f1d1d'             // Deep Mahogany
  },
  'dark': {
    name: 'Dark Cockpit',
    bg: '#0d1117',
    text: '#f8fafc',          // Pure bright text
    textMuted: '#94a3b8',     // Slate 400
    grid: 'rgba(255, 255, 255, 0.15)',
    topStroke: '#ffffff',
    divider: '#0d1117',
    blockStroke: 'rgba(0, 0, 0, 0.5)',
    badgeBg: '#161b22',
    badgeStroke: '#475569',
    badgeText: '#f8fafc',
    cutLine: 'rgba(255, 255, 255, 0.25)',
    z1: '#22c55e',            // Bright Green
    z2: '#eab308',            // Bright Yellow
    z3: '#f97316',            // Bright Orange
    z4: '#ef4444'             // Bright Red
  },
  'neon': {
    name: 'Cyberpunk Neon (OLED Black)',
    bg: '#000000',            // True OLED Pitch Black
    text: '#ffffff',          // Pure Stark White
    textMuted: '#94a3b8',     // Slate 400
    grid: 'rgba(56, 189, 248, 0.18)',
    topStroke: '#38bdf8',     // Laser Sky Cyan
    divider: '#000000',
    blockStroke: 'rgba(0, 0, 0, 0.9)',
    badgeBg: '#090d16',
    badgeStroke: '#38bdf8',
    badgeText: '#ffffff',
    cutLine: 'rgba(56, 189, 248, 0.4)',
    z1: '#06b6d4',            // Electric Cyan (<5%)
    z2: '#a3e635',            // Acid Lime (5-8%)
    z3: '#fb923c',            // Electric Blaze Amber (8-12%)
    z4: '#f43f5e'             // Ultraviolet Hot Pink (>12%)
  },
  'prism': {
    name: 'Velo Spectrum (Color Pop)',
    bg: '#ffffff',
    text: '#0f172a',          // Crisp deep black/slate for maximum outdoor readability
    textMuted: '#475569',     // Slate 600
    grid: 'rgba(99, 102, 241, 0.20)', // Electric indigo grid
    topStroke: '#6366f1',     // Laser Indigo skyline
    divider: '#ffffff',
    blockStroke: 'rgba(15, 23, 42, 0.40)',
    badgeBg: '#fdf4ff',       // Soft magenta tint
    badgeStroke: '#d946ef',   // Neon Fuchsia / Magenta
    badgeText: '#701a75',     // Deep Plum
    cutLine: 'rgba(217, 70, 239, 0.45)',
    z1: '#06b6d4',            // Electric Cyan (<5%)
    z2: '#10b981',            // Vivid Emerald (5-8%)
    z3: '#f59e0b',            // Neon Amber Gold (8-12%)
    z4: '#ec4899'             // Radiant Hot Pink (>12%)
  }
};

/**
 * Resolves the categorical color for a climb's summit pill badge based on UCI severity.
 *
 * @param {string} category - Climb category (HC, Cat 1, Cat 2, Cat 3, Cat 4)
 * @param {RenderTheme} theme - Active color theme
 * @returns {string} Hex color string
 */
export function getClimbCategoryColor(category, theme) {
  const cat = (category || '').toUpperCase();
  if (cat.includes('HC') || cat.includes('1')) return theme.z4 || '#dc2626';
  if (cat.includes('2')) return theme.z3 || '#ea580c';
  if (cat.includes('3')) return theme.z2 || '#d97706';
  return theme.z1 || '#16a34a';
}
