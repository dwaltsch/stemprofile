/**
 * Validation of fueling plans restored from browser storage.
 *
 * Saved plans outlive app versions and can be corrupted or edited by hand, so
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

/**
 * Rebuilds a saved fueling plan from validated fields.
 *
 * @param {*} saved - Parsed value from storage
 * @param {number} totalDistM - Route length; items outside the route are dropped
 * @returns {Object|null} Clean partial fueling state, or null when unusable
 */
export function sanitizeSavedFuelingPlan(saved, totalDistM) {
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.items)) return null;

  const items = saved.items
    .filter(it => it && typeof it === 'object' && Number.isFinite(it.distM) && it.distM >= 0 && it.distM <= totalDistM)
    .slice(0, MAX_SAVED_ITEMS)
    .map(it => ({
      id: typeof it.id === 'string' && SAFE_ID_RE.test(it.id) ? it.id : generateFuelId(),
      distM: Math.round(it.distM),
      name: text(it.name, 100, 'Fuel Item'),
      type: ITEM_TYPES.has(it.type) ? it.type : 'gel',
      icon: text(it.icon, 8, '⚡'),
      carbsG: clamp(it.carbsG, 0, 500, 0),
      fluidMl: clamp(it.fluidMl, 0, 3000, 0),
      notes: text(it.notes, 200),
      isAidStation: it.isAidStation === true,
      enabled: it.enabled !== false
    }));
  if (items.length === 0) return null;
  items.sort((a, b) => a.distM - b.distM);

  const defaults = {};
  const rawDefaults = saved.productDefaults && typeof saved.productDefaults === 'object' ? saved.productDefaults : {};
  for (const [key, def] of Object.entries(DEFAULT_FUEL_PRODUCT_DEFAULTS)) {
    defaults[key] = clamp(rawDefaults[key], 0, key === 'bottleFluidMl' ? 3000 : 500, def);
  }

  const plan = {
    items,
    customized: saved.customized === true,
    productDefaults: defaults
  };
  if (Number.isFinite(saved.targetCarbsPerHour)) plan.targetCarbsPerHour = clamp(saved.targetCarbsPerHour, 30, 140, 75);
  if (Number.isFinite(saved.avgSpeedKmh)) plan.avgSpeedKmh = clamp(saved.avgSpeedKmh, 5, 60, 25);
  if (Number.isFinite(saved.aidStationStopMin)) plan.aidStationStopMin = clamp(saved.aidStationStopMin, 0, 60, 0);
  if (saved.pacingMode === 'terrain' || saved.pacingMode === 'constant') plan.pacingMode = saved.pacingMode;
  if (saved.mode === 'km' || saved.mode === 'time') plan.mode = saved.mode;
  return plan;
}
