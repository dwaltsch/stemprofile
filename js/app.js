/**
 * StemProfile Application Coordinator
 *
 * Bootstraps the application, connects reactive store events with UI component
 * controllers, and orchestrates URL hash routing and high-resolution export pipelines.
 *
 * @module app
 */

import { store } from './store.js';
import { renderProfileSVG } from './renderer.js';
import { exportSVG, exportPNG, copySVG, updatePrintMatrix } from './export.js';
import { copyShareableLink, decompressPayload } from './share.js';
import { getUnitFactors, getUnitLabels, formatElevation } from './units.js';
import { getRecommendedBlockPresets } from './layout.js';

// Modular UI Controllers
import { initTheme } from './ui/theme.js';
import { initDropzone } from './ui/dropzone.js';
import { initControls, syncFormControls, updateBlockSizePills } from './ui/controls.js';
import { initWaypointsPanel, renderWaypointsList } from './ui/waypoints-panel.js';
import { renderClimbsTable } from './ui/climbs-panel.js';
import { initDragEngine } from './ui/drag-engine.js';
import { bindTooltipHover } from './ui/tooltip.js';
import { showToast } from './ui/toast.js';
import { initPrintModal, openPrintModal, updatePrintModalPreview, getActivePrintConfig } from './ui/print-modal.js';

// Backward compatibility exports
export { getRecommendedBlockPresets } from './layout.js';
export { updateBlockSizePills } from './ui/controls.js';

/**
 * Backward compatibility helper for toggling climb label visibility.
 *
 * @param {string|number} climbId - ID of climb
 */
export function toggleClimbLabelVisibility(climbId) {
  store.toggleClimbVisibility(climbId);
}

/**
 * Synchronizes the entire presentation layer with the current store state.
 */
export function updateUI() {
  const state = store.getState();
  const cfg = state.settings;
  const stats = state.stats;
  const pts = state.points;
  const hasData = pts.length >= 2 && stats !== null;

  // 1. Render Vector Profile SVG Preview
  const svgHost = document.getElementById('svg-host');
  if (svgHost) {
    if (hasData) {
      svgHost.innerHTML = renderProfileSVG(state);
    } else {
      svgHost.innerHTML = `
        <div class="empty-msg">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <h3>No Route Loaded</h3>
          <p>Tap to select a GPX, TCX, or FIT file (or drop on desktop)</p>
          <span class="btn btn-secondary empty-browse-btn" style="margin-top:0.35rem; pointer-events:none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Choose Route File
          </span>
        </div>
      `;
    }
  }

  // 2. Buttons State
  const buttons = ['btn-share-link', 'btn-copy-svg', 'btn-export-svg', 'btn-export-png', 'btn-print'];
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasData;
  });

  // 3. Stats Strip & Header Route Status Pill
  const { dFactor, eFactor } = getUnitFactors(cfg.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(cfg.units);
  const routeStatusText = document.getElementById('route-status-text');
  const climbsCount = state.climbs ? state.climbs.length : 0;

  const mobileClimbsCount = document.getElementById('mobile-climbs-count');
  if (mobileClimbsCount) mobileClimbsCount.textContent = `${climbsCount}`;

  if (hasData) {
    const distFormatted = `${(stats.totalDist * dFactor).toFixed(1)} ${distUnit}`;
    const gainFormatted = formatElevation(stats.elevGain, cfg.units, true);
    const maxGradeFormatted = `${stats.maxGrade.toFixed(1)}%`;

    const statDist = document.getElementById('stat-dist');
    const statGain = document.getElementById('stat-gain');
    const statMaxGrade = document.getElementById('stat-max-grade');
    const statClimbs = document.getElementById('stat-climbs');

    if (statDist) statDist.textContent = distFormatted;
    if (statGain) statGain.textContent = gainFormatted;
    if (statMaxGrade) statMaxGrade.textContent = maxGradeFormatted;
    if (statClimbs) statClimbs.textContent = `${climbsCount}`;

    if (routeStatusText) {
      const title = cfg.title || 'Active Track';
      routeStatusText.textContent = `${title} · ${distFormatted} · ${gainFormatted}`;
    }
  } else {
    ['stat-dist', 'stat-gain', 'stat-max-grade', 'stat-climbs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
    if (routeStatusText) {
      routeStatusText.textContent = 'No track loaded';
    }
  }

  // 4. Update Panels & Overlays
  renderClimbsTable(store);
  renderWaypointsList(store);
  updatePrintMatrix(state, null, null, null, null, null, getActivePrintConfig());
  bindTooltipHover(store);
}

/**
 * Loads shared route profile state from URL hash payload (GitHub Pages sharing).
 *
 * @param {string} hashStr - Raw hash string
 * @returns {Promise<boolean>} Success state
 */
export async function loadFromUrlHash(hashStr) {
  if (!hashStr) return false;

  let raw = hashStr.trim().replace(/^[#?]/, '');
  try {
    raw = decodeURIComponent(raw);
  } catch (_) {}

  let b64 = raw;
  if (raw.includes('stage=')) {
    b64 = raw.split('stage=')[1].split('&')[0];
  } else if (raw.includes('data=')) {
    b64 = raw.split('data=')[1].split('&')[0];
  } else if (raw.includes('route=')) {
    b64 = raw.split('route=')[1].split('&')[0];
  }

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
 * Initializes workbench click interactions and export dialog buttons.
 */
function initActions() {
  const svgHost = document.getElementById('svg-host');
  const fin = document.getElementById('file-input');

  // Clicking SVG: if empty opens file picker; if loaded pre-fills distance for waypoint form
  if (svgHost) {
    svgHost.addEventListener('click', e => {
      const state = store.getState();
      if (state.points.length < 2 || !state.stats) {
        if (fin) fin.click();
        return;
      }
      const svg = document.getElementById('profile-svg-elem');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
      const targetDistM = ratio * state.stats.totalDist;

      const { dFactor } = getUnitFactors(state.settings.units);
      const distVal = (targetDistM * dFactor).toFixed(1);

      const distInput = document.getElementById('input-wpt-dist');
      const labelInput = document.getElementById('input-wpt-label');
      if (distInput) {
        distInput.value = distVal;
        if (labelInput) labelInput.focus();
      }
    });
  }

  // Header Load GPX button trigger
  const btnLoadGpx = document.getElementById('btn-load-gpx');
  if (btnLoadGpx && fin) {
    btnLoadGpx.addEventListener('click', () => fin.click());
  }

  // Stage Zoom Controls (Large / Max / 1:1 Actual)
  const zoomBtns = document.querySelectorAll('#stage-zoom-controls .zoom-btn');
  const stickerWrapper = document.getElementById('sticker-container');

  zoomBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      zoomBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const zoom = btn.dataset.zoom;

      if (zoom === 'actual') {
        document.documentElement.style.setProperty('--stage-zoom-w', 'var(--sticker-w)');
        if (stickerWrapper) stickerWrapper.classList.add('zoom-actual');
      } else if (zoom === 'max') {
        document.documentElement.style.setProperty('--stage-zoom-w', '880px');
        if (stickerWrapper) stickerWrapper.classList.remove('zoom-actual');
      } else {
        // Large (Default view: ~720px)
        document.documentElement.style.setProperty('--stage-zoom-w', '720px');
        if (stickerWrapper) stickerWrapper.classList.remove('zoom-actual');
      }
    });
  });

  // Share Link Button (URL Hash for GitHub Pages)
  const btnShareLink = document.getElementById('btn-share-link');
  if (btnShareLink) {
    btnShareLink.addEventListener('click', async () => {
      try {
        const orig = btnShareLink.innerHTML;
        btnShareLink.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Link Copied!`;
        await copyShareableLink(store.getState());
        showToast('Share link copied to clipboard', 'success');
        setTimeout(() => { btnShareLink.innerHTML = orig; }, 1800);
      } catch (err) {
        showToast('Failed to generate share link: ' + err.message, 'error');
      }
    });
  }

  // Reset Custom Dragged Labels Button
  const btnResetLabels = document.getElementById('btn-reset-labels');
  if (btnResetLabels) {
    btnResetLabels.addEventListener('click', () => {
      store.resetCustomPositions();
      showToast('Reset label positions to auto layout', 'info');
    });
  }

  // Export Buttons
  const btnCopy = document.getElementById('btn-copy-svg');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      copySVG(store.getState(), err => {
        if (!err) {
          const orig = btnCopy.innerHTML;
          btnCopy.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
          showToast('SVG markup copied to clipboard', 'success');
          setTimeout(() => { btnCopy.innerHTML = orig; }, 1400);
        } else {
          showToast('Failed to copy SVG: ' + err.message, 'error');
        }
      });
    });
  }

  const btnExportSvg = document.getElementById('btn-export-svg');
  if (btnExportSvg) {
    btnExportSvg.addEventListener('click', () => {
      exportSVG(store.getState());
      showToast('Downloading SVG file...', 'info');
    });
  }

  const btnExportPng = document.getElementById('btn-export-png');
  if (btnExportPng) {
    btnExportPng.addEventListener('click', () => {
      showToast('Rendering 300 DPI PNG...', 'info');
      exportPNG(store.getState(), err => {
        if (err) showToast('PNG export failed: ' + err.message, 'error');
      });
    });
  }

  const btnPrint = document.getElementById('btn-print');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      openPrintModal(store);
    });
  }

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      const modal = document.getElementById('modal-print-studio');
      const isModalOpen = modal && modal.style.display === 'flex';
      if (isModalOpen) {
        updatePrintMatrix(store.getState(), null, null, null, null, null, getActivePrintConfig());
        window.print();
      } else {
        e.preventDefault();
        openPrintModal(store);
      }
    }
  });

  window.addEventListener('beforeprint', () => {
    updatePrintMatrix(store.getState(), null, null, null, null, null, getActivePrintConfig());
  });
}

/**
 * Toggles active mobile workstation tab ('preview' | 'design' | 'climbs').
 *
 * @param {'preview'|'design'|'climbs'} tab - Active tab identifier
 */
export function setMobileTab(tab) {
  const tabBtns = document.querySelectorAll('.mobile-tab-btn');
  const appLayout = document.getElementById('app-layout') || document.querySelector('.app-layout');
  if (!appLayout) return;

  tabBtns.forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  appLayout.setAttribute('data-mobile-tab', tab);
}

/**
 * Initializes listeners for the mobile segmented tab navigation strip.
 */
function initMobileTabs() {
  const tabBtns = document.querySelectorAll('.mobile-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) setMobileTab(tab);
    });
  });
}

/**
 * Initializes application modules and registers store subscriptions.
 */
export function initApp() {
  initTheme(store);
  initDropzone(store);
  initControls(store);
  initWaypointsPanel(store);
  initDragEngine(store);
  initPrintModal(store);
  initActions();
  initMobileTabs();

  // Reactive store subscription
  store.subscribe((state, event) => {
    updateUI();
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
  window.addEventListener('DOMContentLoaded', initApp);
}
