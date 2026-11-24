/**
 * Validation of fueling plans restored from browser storage or share links.
 *
 * Saved plans and links outlive app versions and can be corrupted or edited by hand, so
 * they are rebuilt from known fields only, with types checked and numbers
 * clamped. Anything structurally broken yields null and a fresh plan is used.
 *
 * @module fueling/sanitize
 */

import { DEFAULT_FUEL_PRODUCT_DEFAULTS, FUEL_PRESETS, generateFuelId } from './presets.js';

const MAX_SAVED_ITEMS = 200;
const ITEM_TYPES = new Set([...Object.keys(FUEL_PRESETS), 'hc', 'caff', 'bottle']);
const SAFE_ID_RE = /^[\w-]{1,64}$/;

const clamp = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const text = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);

/** Clamps one fuel item list against the route length; drops broken entries. */
function sanitizeItems(rawItems, totalDistM) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .filter(it => it && typeof it === 'object' && Number.isFinite(it.distM) && it.distM >= 0 && it.distM <= totalDistM)
    .slice(0, MAX_SAVED_ITEMS)
    .map(it => {
      const type = ITEM_TYPES.has(it.type) ? it.type : 'gel';
      return {
        id: typeof it.id === 'string' && SAFE_ID_RE.test(it.id) ? it.id : generateFuelId(),
        distM: Math.round(it.distM),
        name: text(it.name, 100, 'Fuel Item'),
        type,
        icon: text(it.icon, 8, (FUEL_PRESETS[type] && FUEL_PRESETS[type].icon) || '⚡'),
        carbsG: clamp(it.carbsG, 0, 500, 0),
        fluidMl: clamp(it.fluidMl, 0, 3000, 0),
        notes: text(it.notes, 200),
        isAidStation: it.isAidStation === true,
        enabled: it.enabled !== false
      };
    })
    .sort((a, b) => a.distM - b.distM);
}

/** Validated fueling settings (targets, pacing, product defaults) from an untrusted object. */
function sanitizeConfig(saved) {
  const defaults = {};
  const rawDefaults = saved.productDefaults && typeof saved.productDefaults === 'object' ? saved.productDefaults : {};
  for (const [key, def] of Object.entries(DEFAULT_FUEL_PRODUCT_DEFAULTS)) {
    defaults[key] = clamp(rawDefaults[key], 0, key === 'bottleFluidMl' ? 3000 : 500, def);
  }
  const config = { productDefaults: defaults };
  if (Number.isFinite(saved.targetCarbsPerHour)) config.targetCarbsPerHour = clamp(saved.targetCarbsPerHour, 30, 140, 75);
  if (Number.isFinite(saved.avgSpeedKmh)) config.avgSpeedKmh = clamp(saved.avgSpeedKmh, 5, 60, 25);
  if (Number.isFinite(saved.aidStationStopMin)) config.aidStationStopMin = clamp(saved.aidStationStopMin, 0, 60, 0);
  if (saved.pacingMode === 'terrain' || saved.pacingMode === 'constant') config.pacingMode = saved.pacingMode;
  if (saved.mode === 'km' || saved.mode === 'time') config.mode = saved.mode;
  return config;
}

/**
 * Validates a fuel plan restored from browser storage against the current route.
 *
 * @param {*} saved - Parsed plan from localStorage (untrusted)
 * @param {number} totalDistM - Route length in metres; items beyond it are dropped
 * @returns {Object|null} Sanitized plan, or null when it has no usable items
 */
export function sanitizeSavedFuelingPlan(saved, totalDistM) {
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.items)) return null;
  const items = sanitizeItems(saved.items, totalDistM);
  if (items.length === 0) return null;
  return { ...sanitizeConfig(saved), items, customized: saved.customized === true };
}

/**
 * Validates the fuel section of a share link against the route it came with.
 * Settings always apply; when the link has no usable items the caller
 * regenerates the plan from these settings.
 *
 * @param {*} shared - Decoded fuel section (untrusted)
 * @param {number} totalDistM - Route length in metres
 * @returns {{ config: Object, items: Array|null, customized: boolean }|null} Null when there is no fuel section
 */
export function sanitizeSharedFueling(shared, totalDistM) {
  if (!shared || typeof shared !== 'object') return null;
  const items = sanitizeItems(shared.items, totalDistM);
  return { config: sanitizeConfig(shared), items: items.length > 0 ? items : null, customized: shared.customized === true };
}
