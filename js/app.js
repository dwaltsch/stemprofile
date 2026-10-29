/**
 * StemProfile Application Coordinator
 *
 * Bootstraps the application, connects reactive store events with UI component
 * controllers, and orchestrates URL hash routing and high-resolution export pipelines.
 *
 * @module app
 */

import { store } from './store.js';
import { updatePrintMatrix } from './export.js';
import { decompressPayload, extractHashPayload } from './share.js';

// Modular UI Controllers
import { initTheme } from './ui/theme.js';
import { initDropzone } from './ui/dropzone.js';
import { initControls, syncFormControls, updateBlockSizePills } from './ui/controls.js';
import { initWaypointsPanel, renderWaypointsList } from './ui/waypoints-panel.js';
import { renderClimbsTable } from './ui/climbs-panel.js';
import { initFuelingPanel, renderFuelingPanel } from './ui/fueling-panel.js';
import { initDragEngine } from './ui/drag-engine.js';
import { bindTooltipHover } from './ui/tooltip.js';
import { showToast } from './ui/toast.js';
import { initPrintModal, updatePrintModalPreview, getActivePrintConfig } from './ui/print-modal.js';
import { renderPreview, syncViewMode } from './ui/workbench.js';
import { updateStatsStrip } from './ui/stats-strip.js';
import { initActions } from './ui/actions.js';
import { setMobileTab as setMobileTabView, initMobileTabs } from './ui/mobile-tabs.js';

// Backward compatibility exports
export { store };
export { getRecommendedBlockPresets } from './layout.js';
export { updateBlockSizePills } from './ui/controls.js';
export { openRouteFilePicker } from './ui/dropzone.js';

/**
 * Backward compatibility helper for toggling climb label visibility.
 *
 * @param {string|number} climbId - ID of climb
 */
export function toggleClimbLabelVisibility(climbId) {
  store.toggleClimbVisibility(climbId);
}

/**
 * Side panels that need re-rendering per store event. Events not listed here
 * (track/payload loads, settings and view changes) refresh everything.
 */
const ALL_PANELS = ['climbs', 'waypoints', 'fueling', 'controls'];
const EVENT_PANELS = {
  'positions:updated': [],
  'positions:reset': [],
  'climbs:visibility': ['climbs'],
  'waypoints:updated': ['waypoints', 'fueling'],
  'fueling:updated': ['fueling']
};

/**
 * Synchronizes the presentation layer with the current store state.
 * The preview SVG, stats and print matrix always refresh; side panels and form
 * controls only refresh when the triggering event can affect them.
 *
 * @param {string} [event] - Store event name; omitted means full refresh
 */
export function updateUI(event) {
  const panels = new Set(EVENT_PANELS[event] || ALL_PANELS);
  const state = store.getState();
  const isFuelingView = state.activeView === 'fueling';

  // 1. Preview, stats strip and view-mode chrome
  renderPreview(state);
  updateStatsStrip(state);
  syncViewMode(state);

  // Sync Left Sidebar dimension inputs & presets to active mode
  if (panels.has('controls')) syncFormControls(state);

  // 2. Update Panels & Overlays
  if (panels.has('climbs')) renderClimbsTable(store);
  if (panels.has('waypoints')) renderWaypointsList(store);
  if (panels.has('fueling')) renderFuelingPanel(store);
  updatePrintMatrix(state, null, null, null, null, null, getActivePrintConfig());
  if (!isFuelingView) {
    bindTooltipHover(store);
  }
}

/**
 * Loads shared route profile state from URL hash payload (GitHub Pages sharing).
 *
 * @param {string} hashStr - Raw hash string
 * @returns {Promise<boolean>} Success state
 */
export async function loadFromUrlHash(hashStr) {
  if (!hashStr) return false;

  const b64 = extractHashPayload(hashStr);
  if (!b64 || b64.length < 5) return false;

  const payload = await decompressPayload(b64);
  if (!payload || !payload.coords || payload.coords.length < 2) {
    showToast('Invalid or incomplete shared link.', 'warning');
    return false;
  }

  const success = store.loadPayload(payload);
  if (success) {
    const s = store.getState();
    showToast(`Loaded ${s.settings.title || 'Shared Route'} (${s.rawCoords.length} points)`, 'success');
  }
  return success;
}

/**
 * Toggles active mobile workstation tab ('preview' | 'design' | 'climbs' | 'fueling').
 *
 * @param {'preview'|'design'|'climbs'|'fueling'} tab - Active tab identifier
 */
export function setMobileTab(tab) {
  setMobileTabView(store, tab);
}

/**
 * Initializes application modules and registers store subscriptions.
 */
export function initApp() {
  initTheme(store);
  initDropzone(store);
  initControls(store);
  initWaypointsPanel(store);
  initFuelingPanel(store);
  initDragEngine(store);
  initPrintModal(store);
  initActions(store);
  initMobileTabs(store);

  // Reactive store subscription
  store.subscribe((state, event) => {
    updateUI(event);
    const modal = document.getElementById('modal-print-studio');
    if (modal && modal.style.display === 'flex') {
      updatePrintModalPreview(store);
    }
    if (event === 'track:loaded' || event === 'payload:loaded') {
      syncFormControls(state);
      updateBlockSizePills(store);
      // Auto-focus preview on mobile when track is loaded
      if (typeof window !== 'undefined' && window.innerWidth <= 900) {
        setMobileTab('preview');
      }
    }
  });

  // Initial Hash Routing
  const incomingHash = window.location.hash || window.location.search;
  if (incomingHash && incomingHash.length > 5) {
    loadFromUrlHash(incomingHash).then(success => {
      if (!success) updateUI();
    }).catch(err => {
      console.error('Failed to load shared route from URL hash:', err);
      updateUI();
    });
  } else {
    updateUI();
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash && window.location.hash.length > 5) {
      loadFromUrlHash(window.location.hash).then(success => {
        if (!success) updateUI();
      });
    }
  });
}

// Auto-initialize when running in browser DOM environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
