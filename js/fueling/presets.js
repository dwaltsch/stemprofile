/**
 * Fueling defaults, product presets and fuel item id generation.
 *
 * @module fueling/presets
 */

/**
 * Default nutritional values for standard products (customizable by athlete).
 */
export const DEFAULT_FUEL_PRODUCT_DEFAULTS = {
  gelCarbs: 25,
  bottleCarbs: 40,
  bottleFluidMl: 500,
  barCarbs: 35,
  hcGelCarbs: 40,
  caffGelCarbs: 30
};

/**
 * Standard default configuration for fueling strategies.
 */
export const DEFAULT_FUELING_CONFIG = {
  targetCarbsPerHour: 75,       // Default within the 60-80g CHO/h bracket
  avgSpeedKmh: 25,              // Default pacing average speed (km/h)
  pacingMode: 'terrain',        // 'terrain' (gradient-aware) or 'constant' speed
  mode: 'km',                   // cue sheet index: 'km' (default) or 'time'
  hazardClimbThreshold: 8.5,    // Grade % above which eating is hazardous
  hazardDescentThreshold: -5.0, // Grade % below which descending is hazardous
  longClimbDistThresholdM: 5000,// 5km+ climb requires mid-climb fueling
  productDefaults: { ...DEFAULT_FUEL_PRODUCT_DEFAULTS }
};

/**
 * Nutritional item catalog with standard pro cycling presets.
 */
export const FUEL_PRESETS = {
  gel: {
    id: 'gel',
    name: 'Gel',
    type: 'gel',
    icon: '⚡',
    shortCode: 'GEL',
    carbsG: 25,
    fluidMl: 0,
    color: '#eab308'
  },
  gel_high_carb: {
    id: 'gel_high_carb',
    name: 'HC Gel',
    type: 'gel',
    icon: '⚡⚡',
    shortCode: 'HC GEL',
    carbsG: 40,
    fluidMl: 0,
    color: '#f97316'
  },
  caff_gel: {
    id: 'caff_gel',
    name: 'Caff Gel',
    type: 'caff_gel',
    icon: '⚡☕',
    shortCode: 'CAFF',
    carbsG: 30,
    fluidMl: 0,
    color: '#ef4444'
  },
  bottle_mix: {
    id: 'bottle_mix',
    name: 'Carb Mix',
    type: 'bottle',
    icon: '🍾',
    shortCode: 'MIX',
    carbsG: 40,
    fluidMl: 500,
    color: '#06b6d4'
  },
  bottle_super: {
    id: 'bottle_super',
    name: 'Super Mix',
    type: 'bottle',
    icon: '🍾',
    shortCode: 'SUPER',
    carbsG: 80,
    fluidMl: 750,
    color: '#2563eb'
  },
  bar: {
    id: 'bar',
    name: 'Bar',
    type: 'bar',
    icon: '🍫',
    shortCode: 'BAR',
    carbsG: 35,
    fluidMl: 0,
    color: '#d97706'
  },
  chews: {
    id: 'chews',
    name: 'Chews',
    type: 'chews',
    icon: '🍬',
    shortCode: 'CHEW',
    carbsG: 30,
    fluidMl: 0,
    color: '#16a34a'
  },
  food: {
    id: 'food',
    name: 'Chews',
    type: 'chews',
    icon: '🍬',
    shortCode: 'CHEW',
    carbsG: 30,
    fluidMl: 0,
    color: '#16a34a'
  },
  feed_zone: {
    id: 'feed_zone',
    name: 'Feed Zone',
    type: 'feed_zone',
    icon: '🍽️',
    shortCode: 'FEED',
    carbsG: 40,
    fluidMl: 500,
    color: '#8b5cf6'
  },
  water: {
    id: 'water',
    name: 'Water',
    type: 'water',
    icon: '💧',
    shortCode: 'H2O',
    carbsG: 0,
    fluidMl: 500,
    color: '#38bdf8'
  },
  salt: {
    id: 'salt',
    name: 'Salt Tab',
    type: 'salt',
    icon: '💊',
    shortCode: 'SALT',
    carbsG: 0,
    fluidMl: 0,
    color: '#ec4899'
  }
};

/** Item types whose amounts come from the rider's product defaults (the rest use their preset). */
export const PRODUCT_DEFAULT_TYPES = new Set(['gel', 'gel_high_carb', 'hc', 'caff_gel', 'caff', 'bar', 'bottle_mix', 'bottle', 'bottle_super', 'feed_zone', 'water']);

/**
 * Carbs and fluid a new item of `type` gets, from the rider's product defaults
 * where one applies (gels, bars, bottles) and the preset otherwise.
 *
 * @param {string} type - Item type (preset id or short alias: hc, caff, bottle)
 * @param {Object} [defs=DEFAULT_FUEL_PRODUCT_DEFAULTS] - Product defaults
 * @returns {{ carbsG: number, fluidMl: number }}
 */
export function defaultAmountsFor(type, defs = DEFAULT_FUEL_PRODUCT_DEFAULTS) {
  const d = { ...DEFAULT_FUEL_PRODUCT_DEFAULTS, ...(defs || {}) };
  switch ((type || 'gel').toLowerCase()) {
    case 'gel': return { carbsG: d.gelCarbs, fluidMl: 0 };
    case 'gel_high_carb': case 'hc': return { carbsG: d.hcGelCarbs, fluidMl: 0 };
    case 'caff_gel': case 'caff': return { carbsG: d.caffGelCarbs, fluidMl: 0 };
    case 'bar': return { carbsG: d.barCarbs, fluidMl: 0 };
    case 'bottle_mix': case 'bottle': return { carbsG: d.bottleCarbs, fluidMl: d.bottleFluidMl };
    case 'bottle_super': return { carbsG: Math.round(d.bottleCarbs * 1.8), fluidMl: Math.round(d.bottleFluidMl * 1.5) };
    case 'feed_zone': return { carbsG: d.bottleCarbs, fluidMl: d.bottleFluidMl };
    case 'water': return { carbsG: 0, fluidMl: d.bottleFluidMl };
    default: {
      const preset = FUEL_PRESETS[type];
      return preset ? { carbsG: preset.carbsG, fluidMl: preset.fluidMl } : { carbsG: d.gelCarbs, fluidMl: 0 };
    }
  }
}

/**
 * Generates an 8-character unique alphanumeric ID.
 * @returns {string} Unique ID
 */
export function generateFuelId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fuel-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `fuel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
