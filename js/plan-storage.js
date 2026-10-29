/**
 * Fuel Plan Storage Module
 *
 * Persists per-route fueling plans in localStorage with a bounded
 * most-recently-used index, so storage cannot grow forever and a full quota
 * evicts old plans instead of silently failing every save.
 *
 * @module plan-storage
 */

export const PLAN_KEY_PREFIX = 'stemprofile_fuel_';
export const PLAN_INDEX_KEY = 'stemprofile_plan_index';
export const MAX_SAVED_PLANS = 20;

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (_) {
    return null;
  }
}

/** Plan keys, most recently used first. Adopts plans saved before the index existed. */
function readIndex(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(PLAN_INDEX_KEY));
    if (Array.isArray(parsed)) return parsed.filter(k => typeof k === 'string' && k.startsWith(PLAN_KEY_PREFIX));
  } catch (_) {}
  const keys = [];
  for (let i = 0; i < (storage.length || 0); i++) {
    const k = storage.key(i);
    if (k && k.startsWith(PLAN_KEY_PREFIX)) keys.push(k);
  }
  return keys;
}

/** Moves key to the front of the index and evicts plans beyond MAX_SAVED_PLANS. */
function touch(storage, key) {
  const index = [key, ...readIndex(storage).filter(k => k !== key)];
  for (const evicted of index.splice(MAX_SAVED_PLANS)) storage.removeItem(evicted);
  storage.setItem(PLAN_INDEX_KEY, JSON.stringify(index));
}

/**
 * Saves a plan; when the quota is full, evicts the least recently used plans and retries.
 *
 * @param {string} key - Plan key (PLAN_KEY_PREFIX + route id)
 * @param {Object} value - Plan to save
 * @param {Storage} [storage]
 * @returns {boolean} Whether the plan was saved
 */
export function savePlan(key, value, storage = defaultStorage()) {
  if (!storage || !key) return false;
  const json = JSON.stringify(value);
  for (;;) {
    try {
      storage.setItem(key, json);
      touch(storage, key);
      return true;
    } catch (_) {
      const others = readIndex(storage).filter(k => k !== key);
      if (others.length === 0) return false;
      const oldest = others.pop();
      try {
        storage.removeItem(oldest);
        storage.setItem(PLAN_INDEX_KEY, JSON.stringify(others));
      } catch (__) {
        return false;
      }
    }
  }
}

/**
 * Loads a saved plan (marking it most recently used).
 *
 * @param {string} key - Plan key
 * @param {Storage} [storage]
 * @returns {*} Parsed plan, or null when missing / unreadable
 */
export function loadPlan(key, storage = defaultStorage()) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    touch(storage, key);
    return parsed;
  } catch (_) {
    return null;
  }
}
