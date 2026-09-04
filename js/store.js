/**
 * Reactive Application Store Module
 *
 * Centralized, zero-dependency state container for StemProfile.
 * Manages track telemetry, user styling preferences, tactical waypoints,
 * custom label placements, and notifies UI subscribers upon mutations.
 *
 * @module store
 */

import { processTrackSignal, matchWaypointsToTrack } from './signal.js';
import { DEFAULT_SETTINGS } from './share.js';
import { getRecommendedBlockPresets } from './layout.js';
import { normalizeCoordinates } from './units.js';
import {
  DEFAULT_FUELING_CONFIG,
  DEFAULT_FUEL_PRODUCT_DEFAULTS,
  generateDefaultFuelPlan,
  generateFuelId,
  distToElapsedSeconds,
  formatElapsedSeconds,
  detectTerrainHazard
} from './fueling.js';

/**
 * @typedef {Object} StemStore
 * @property {function(function(Object, string): void): function(): void} subscribe - Subscribes listener callback
 * @property {function(): Object} getState - Returns current state snapshot
 * @property {function({ title?: string, coords: Array<Object|Array<number>>, rawWaypoints?: Array<Object> }): void} setTrack - Sets active track coordinates
 * @property {function(Object, boolean=): void} updateSettings - Updates settings
 * @property {function(number, string=, string=): Object} addWaypoint - Adds waypoint pin
 * @property {function(string): void} removeWaypoint - Removes waypoint pin by ID
 * @property {function(string): void} toggleWaypoint - Toggles waypoint pin visibility
 * @property {function(string|number): void} toggleClimbVisibility - Toggles climb badge visibility
 * @property {function(string, { x: number, y: number }): void} setCustomPosition - Saves custom drag position
 * @property {function(): void} resetCustomPositions - Resets custom drag positions
 * @property {function(Object): boolean} loadPayload - Restores payload state
 */

/**
 * Creates and initializes a reactive application store instance.
 *
 * @param {Object} [initialSettings={}] - Initial configuration overrides
 * @returns {StemStore} Configured store instance
 */
export function createStore(initialSettings = {}) {
  let state = {
    rawCoords: [],
    rawWaypoints: [],
    points: [],
    stats: null,
    climbs: [],
    blocks: [],
    waypoints: [],
    activeView: 'elevation',
    fueling: {
      ...DEFAULT_FUELING_CONFIG,
      items: [],
      customized: false
    },
    settings: {
      ...DEFAULT_SETTINGS,
      title: '',
      customPositions: {},
      ...initialSettings
    }
  };

  const listeners = new Set();

  function notify(event = 'state:changed') {
    for (const listener of listeners) {
      try {
        listener(state, event);
      } catch (err) {
        console.error('Error in store subscriber listener:', err);
      }
    }
  }

  function getStorageKey() {
    if (!state.stats) return null;
    const title = state.settings.title || 'route';
    const dist = Math.round(state.stats.totalDist);
    return `stemprofile_fuel_${title}_${dist}`;
  }

  function saveFuelingPlan() {
    try {
      if (typeof localStorage === 'undefined') return;
      const key = getStorageKey();
      if (!key) return;
      localStorage.setItem(key, JSON.stringify(state.fueling));
    } catch (_) {}
  }

  function loadSavedFuelingPlan() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const key = getStorageKey();
      if (!key) return null;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function reprocess(isNewGPX = false) {
    if (!state.rawCoords || state.rawCoords.length < 2) {
      state.points = [];
      state.stats = null;
      state.climbs = [];
      state.blocks = [];
      state.fueling.items = [];
      return;
    }

    if (isNewGPX) {
      // Determine initial track distance & sticker width to choose recommended block size preset
      const initial = processTrackSignal(state.rawCoords, state.settings.smoothingWindow, 1000);
      const recommended = getRecommendedBlockPresets(
        initial.stats ? initial.stats.totalDist : 0,
        state.settings.widthMm,
        state.settings.heightMm
      );
      state.settings.blockSizeM = recommended.defaultBlockM;
      state.settings.customPositions = {};
    }

    const { points, stats, climbs, blocks } = processTrackSignal(
      state.rawCoords,
      state.settings.smoothingWindow,
      state.settings.blockSizeM
    );

    state.points = points;
    state.stats = stats;
    state.climbs = climbs;
    state.blocks = blocks;

    if (isNewGPX) {
      state.waypoints = (state.rawWaypoints && state.rawWaypoints.length > 0)
        ? matchWaypointsToTrack(state.rawWaypoints, state.rawCoords, points)
        : [];
    }

    if (isNewGPX && state.points.length >= 2) {
      const saved = loadSavedFuelingPlan();
      if (saved && saved.items && saved.items.length > 0) {
        state.fueling = {
          ...DEFAULT_FUELING_CONFIG,
          ...saved
        };
      } else {
        state.fueling.items = generateDefaultFuelPlan({
          points: state.points,
          stats: state.stats,
          climbs: state.climbs,
          waypoints: state.waypoints,
          config: state.fueling
        });
        state.fueling.customized = false;
        saveFuelingPlan();
      }
    }
  }

  return {
    /**
     * Subscribes a callback function to store state change notifications.
     *
     * @param {function(Object, string): void} listener - Callback invoked on state changes
     * @returns {function(): void} Unsubscribe function
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Returns a snapshot of the current state.
     *
     * @returns {Object} Application state
     */
    getState() {
      return state;
    },

    /**
     * Ingests a new GPS track dataset, executes signal processing, and updates state.
     *
     * @param {Object} payload - { title, coords, rawWaypoints }
     */
    setTrack({ title, coords, rawWaypoints = [] }) {
      state.rawCoords = normalizeCoordinates(coords);
      state.rawWaypoints = rawWaypoints || [];
      if (title !== undefined) {
        state.settings.title = title;
      }
      reprocess(true);
      notify('track:loaded');
    },

    /**
     * Updates visual and physical configuration settings.
     *
     * @param {Object} partialSettings - Key-value dictionary of settings to update
     * @param {boolean} [forceReprocess=false] - Whether to re-run smoothing and block discretization
     */
    updateSettings(partialSettings, forceReprocess = false) {
      const prevSmoothing = state.settings.smoothingWindow;
      const prevBlockSize = state.settings.blockSizeM;

      state.settings = {
        ...state.settings,
        ...partialSettings
      };

      const needsReprocess = forceReprocess ||
        state.settings.smoothingWindow !== prevSmoothing ||
        state.settings.blockSizeM !== prevBlockSize;

      if (needsReprocess && state.rawCoords.length >= 2) {
        reprocess(false);
      }

      notify('settings:updated');
    },

    /**
     * Adds a new tactical waypoint pin.
     *
     * @param {number} distM - Distance along track in meters
     * @param {string} [type='feed'] - Waypoint category
     * @param {string} [label=''] - User label
     * @returns {Object} The created waypoint
     */
    addWaypoint(distM, type = 'feed', label = '') {
      const uniqueSuffix = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID().slice(0, 8)
        : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const id = `wpt-${uniqueSuffix}`;
      const wpt = {
        id,
        distM: Math.max(0, distM),
        type,
        label: (label || '').trim(),
        enabled: true
      };
      state.waypoints.push(wpt);
      state.waypoints.sort((a, b) => a.distM - b.distM);
      notify('waypoints:updated');
      return wpt;
    },

    /**
     * Removes a waypoint pin by unique ID.
     *
     * @param {string} id - Waypoint ID
     */
    removeWaypoint(id) {
      state.waypoints = state.waypoints.filter(w => w.id !== id);
      notify('waypoints:updated');
    },

    /**
     * Toggles waypoint pin visibility on the sticker profile.
     *
     * @param {string} id - Waypoint ID
     */
    toggleWaypoint(id) {
      const wpt = state.waypoints.find(w => w.id === id);
      if (wpt) {
        wpt.enabled = !wpt.enabled;
        notify('waypoints:updated');
      }
    },

    /**
     * Toggles a climb summit badge visibility on the sticker profile.
     *
     * @param {string|number} climbId - ID of climb
     */
    toggleClimbVisibility(climbId) {
      if (!state.settings.hiddenClimbIds) {
        state.settings.hiddenClimbIds = [];
      }
      const idStr = String(climbId);
      const idx = state.settings.hiddenClimbIds.findIndex(id => String(id) === idStr);
      if (idx >= 0) {
        state.settings.hiddenClimbIds.splice(idx, 1);
      } else {
        state.settings.hiddenClimbIds.push(Number(climbId) || climbId);
      }
      notify('climbs:visibility');
    },

    /**
     * Saves user-dragged coordinate override for a badge or waypoint.
     *
     * @param {string} dragId - Unique drag element ID (e.g. 'climb-1' or 'wpt-123')
     * @param {{ x: number, y: number }} pos - SVG millimeter coordinates
     */
    setCustomPosition(dragId, pos) {
      if (!state.settings.customPositions) {
        state.settings.customPositions = {};
      }
      state.settings.customPositions[dragId] = {
        x: parseFloat(pos.x.toFixed(2)),
        y: parseFloat(pos.y.toFixed(2))
      };
      notify('positions:updated');
    },

    /**
     * Resets all custom dragged badge coordinates to auto-calculated layout.
     */
    resetCustomPositions() {
      state.settings.customPositions = {};
      notify('positions:reset');
    },

    /**
     * Loads restored application state from a decoded URL hash payload.
     *
     * @param {Object} payload - { title, coords, settings, waypoints }
     */
    loadPayload(payload) {
      if (!payload || !payload.coords || payload.coords.length < 2) return false;

      state.rawCoords = normalizeCoordinates(payload.coords);
      state.rawWaypoints = [];
      state.waypoints = payload.waypoints || [];

      if (payload.settings) {
        state.settings = {
          ...state.settings,
          ...payload.settings,
          title: payload.title !== undefined ? payload.title : (payload.settings.title || state.settings.title)
        };
      } else if (payload.title) {
        state.settings.title = payload.title;
      }

      reprocess(false);
      notify('payload:loaded');
      return true;
    },

    /**
     * Returns current active studio view ('elevation' | 'fueling').
     * @returns {string}
     */
    getActiveView() {
      return state.activeView || 'elevation';
    },

    /**
     * Switches between elevation profile and fueling mode.
     * @param {'elevation'|'fueling'} view
     */
    setActiveView(view) {
      if (view === 'elevation' || view === 'fueling') {
        state.activeView = view;
        notify('view:changed');
      }
    },

    /**
     * Returns current fueling state.
     * @returns {Object}
     */
    getFuelingState() {
      return state.fueling;
    },

    /**
     * Adds a new item to the fueling strategy.
     * @param {Object} itemData
     * @returns {Object} Created item
     */
    addFuelItem(itemData) {
      const distM = Math.max(0, itemData.distM || 0);
      const avgSpeed = state.fueling.avgSpeedKmh || 25;
      const timeSec = distToElapsedSeconds(distM, avgSpeed);
      const hazard = detectTerrainHazard(state.points, distM, state.climbs, state.fueling);
      const defs = state.fueling.productDefaults || DEFAULT_FUEL_PRODUCT_DEFAULTS;

      let defaultCarbs = 25;
      let defaultFluid = 0;
      const t = (itemData.type || 'gel').toLowerCase();
      if (t === 'gel') defaultCarbs = defs.gelCarbs ?? 25;
      else if (t === 'gel_high_carb' || t === 'hc') defaultCarbs = defs.hcGelCarbs ?? 40;
      else if (t === 'caff_gel' || t === 'caff') defaultCarbs = defs.caffGelCarbs ?? 30;
      else if (t === 'bottle_mix' || t === 'bottle') {
        defaultCarbs = defs.bottleCarbs ?? 40;
        defaultFluid = defs.bottleFluidMl ?? 500;
      } else if (t === 'bottle_super') {
        defaultCarbs = Math.round((defs.bottleCarbs ?? 40) * 1.8);
        defaultFluid = Math.round((defs.bottleFluidMl ?? 500) * 1.5);
      } else if (t === 'bar') defaultCarbs = defs.barCarbs ?? 35;
      else if (t === 'chews' || t === 'food') defaultCarbs = 30;
      else if (t === 'water') { defaultCarbs = 0; defaultFluid = defs.bottleFluidMl ?? 500; }
      else if (t === 'feed_zone') { defaultCarbs = defs.bottleCarbs ?? 40; defaultFluid = defs.bottleFluidMl ?? 500; }

      const newItem = {
        id: generateFuelId(),
        distM: Math.round(distM),
        timeSec,
        timeStr: formatElapsedSeconds(timeSec),
        name: (itemData.name || 'Fuel Item').trim(),
        type: itemData.type || 'gel',
        icon: itemData.icon || '⚡',
        carbsG: typeof itemData.carbsG === 'number' ? itemData.carbsG : defaultCarbs,
        fluidMl: typeof itemData.fluidMl === 'number' ? itemData.fluidMl : defaultFluid,
        notes: (itemData.notes || '').trim(),
        grade: hazard.grade,
        isHazard: hazard.isHazard,
        hazardType: hazard.type,
        hazardMessage: hazard.message,
        enabled: true
      };

      state.fueling.items.push(newItem);
      state.fueling.items.sort((a, b) => a.distM - b.distM);
      state.fueling.customized = true;
      saveFuelingPlan();
      notify('fueling:updated');
      return newItem;
    },

    /**
     * Updates an existing fuel item.
     * @param {string} id
     * @param {Object} partial
     */
    updateFuelItem(id, partial) {
      const it = state.fueling.items.find(item => item.id === id);
      if (!it) return;

      Object.assign(it, partial);

      if (partial.distM !== undefined) {
        const avgSpeed = state.fueling.avgSpeedKmh || 25;
        it.distM = Math.max(0, Math.round(partial.distM));
        it.timeSec = distToElapsedSeconds(it.distM, avgSpeed);
        it.timeStr = formatElapsedSeconds(it.timeSec);
        const hazard = detectTerrainHazard(state.points, it.distM, state.climbs, state.fueling);
        it.grade = hazard.grade;
        it.isHazard = hazard.isHazard;
        it.hazardType = hazard.type;
        it.hazardMessage = hazard.message;
        state.fueling.items.sort((a, b) => a.distM - b.distM);
      }

      state.fueling.customized = true;
      saveFuelingPlan();
      notify('fueling:updated');
    },

    /**
     * Removes a fuel item by ID.
     * @param {string} id
     */
    removeFuelItem(id) {
      state.fueling.items = state.fueling.items.filter(item => item.id !== id);
      state.fueling.customized = true;
      saveFuelingPlan();
      notify('fueling:updated');
    },

    /**
     * Reorders fuel items by array index.
     * @param {number} startIndex
     * @param {number} endIndex
     */
    reorderFuelItems(startIndex, endIndex) {
      const items = state.fueling.items;
      if (startIndex < 0 || startIndex >= items.length || endIndex < 0 || endIndex >= items.length) return;
      const [removed] = items.splice(startIndex, 1);
      items.splice(endIndex, 0, removed);
      state.fueling.customized = true;
      saveFuelingPlan();
      notify('fueling:updated');
    },

    /**
     * Updates fueling settings (e.g. targetCarbsPerHour, avgSpeedKmh, mode).
     * @param {Object} partialSettings
     */
    updateFuelSettings(partialSettings) {
      state.fueling = {
        ...state.fueling,
        ...partialSettings
      };

      const avgSpeed = state.fueling.avgSpeedKmh || 25;
      state.fueling.items.forEach(it => {
        it.timeSec = distToElapsedSeconds(it.distM, avgSpeed);
        it.timeStr = formatElapsedSeconds(it.timeSec);
        const hazard = detectTerrainHazard(state.points, it.distM, state.climbs, state.fueling);
        it.grade = hazard.grade;
        it.isHazard = hazard.isHazard;
        it.hazardType = hazard.type;
        it.hazardMessage = hazard.message;
      });

      saveFuelingPlan();
      notify('fueling:updated');
    },

    /**
     * Updates product defaults and optionally applies them to existing items.
     * @param {Object} newDefaults
     * @param {boolean} [applyToExisting=false]
     */
    updateProductDefaults(newDefaults, applyToExisting = false) {
      state.fueling.productDefaults = {
        ...(state.fueling.productDefaults || DEFAULT_FUEL_PRODUCT_DEFAULTS),
        ...newDefaults
      };

      if (applyToExisting && Array.isArray(state.fueling.items)) {
        const defs = state.fueling.productDefaults;
        state.fueling.items.forEach(it => {
          const type = (it.type || '').toLowerCase();
          if (type === 'gel') it.carbsG = defs.gelCarbs ?? 25;
          else if (type === 'gel_high_carb' || type === 'hc') it.carbsG = defs.hcGelCarbs ?? 40;
          else if (type === 'caff_gel' || type === 'caff') it.carbsG = defs.caffGelCarbs ?? 30;
          else if (type === 'bottle_mix' || type === 'bottle') {
            it.carbsG = defs.bottleCarbs ?? 40;
            it.fluidMl = defs.bottleFluidMl ?? 500;
          } else if (type === 'bar') it.carbsG = defs.barCarbs ?? 35;
        });
      }

      saveFuelingPlan();
      notify('fueling:updated');
    },

    /**
     * Regenerates the recommended fueling strategy from scratch.
     */
    regenerateFuelPlan() {
      if (state.points.length < 2 || !state.stats) return;
      state.fueling.items = generateDefaultFuelPlan({
        points: state.points,
        stats: state.stats,
        climbs: state.climbs,
        waypoints: state.waypoints,
        config: state.fueling
      });
      state.fueling.customized = false;
      saveFuelingPlan();
      notify('fueling:updated');
    }
  };
}

/** Default singleton application store instance */
export const store = createStore();
