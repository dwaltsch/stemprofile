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

  function reprocess(isNewGPX = false) {
    if (!state.rawCoords || state.rawCoords.length < 2) {
      state.points = [];
      state.stats = null;
      state.climbs = [];
      state.blocks = [];
      return;
    }

    if (isNewGPX) {
      // Determine initial track distance to choose recommended block size preset
      const initial = processTrackSignal(state.rawCoords, state.settings.smoothingWindow, 1000);
      const recommended = getRecommendedBlockPresets(initial.stats ? initial.stats.totalDist : 0);
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

    if (isNewGPX && state.rawWaypoints && state.rawWaypoints.length > 0) {
      state.waypoints = matchWaypointsToTrack(state.rawWaypoints, state.rawCoords, points);
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
      const id = `wpt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
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
    }
  };
}

/** Default singleton application store instance */
export const store = createStore();
