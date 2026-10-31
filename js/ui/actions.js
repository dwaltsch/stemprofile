/**
 * Workbench Actions UI Module
 *
 * Wires header, stage and export buttons: file picker, click-to-place waypoints,
 * zoom, share link, label reset, SVG/PNG export, print shortcuts and view switching.
 *
 * @module ui/actions
 */

import { loadExampleRoute, openRouteFilePicker } from './dropzone.js';
import { showToast } from './toast.js';
import { openPrintModal, getActivePrintConfig } from './print-modal.js';
import { copyShareableLink } from '../share.js';
import { exportSVG, exportPNG, copySVG, updatePrintMatrix } from '../export.js';
import { getUnitFactors } from '../units.js';
import { distanceAtClientX } from '../renderer/profile-layers.js';
import { setHTML } from './html.js';

/**
 * Initializes workbench click interactions and export dialog buttons.
 *
 * @param {Object} store - Application store
 */
export function initActions(store) {
  const svgHost = document.getElementById('svg-host');

  // Clicking SVG: if empty browse button clicked, open picker; if loaded pre-fills distance for waypoint form
  if (svgHost) {
    svgHost.addEventListener('click', e => {
      const browseBtn = e.target.closest('.empty-browse-btn');
      if (browseBtn) {
        e.preventDefault();
        e.stopPropagation();
        openRouteFilePicker();
        return;
      }

      if (e.target.closest('.empty-example-btn')) {
        e.preventDefault();
        e.stopPropagation();
        loadExampleRoute(store);
        return;
      }

      const state = store.getState();
      if (state.points.length < 2 || !state.stats) {
        return;
      }
      const svg = document.getElementById('profile-svg-elem');
      if (!svg) return;
      const targetDistM = distanceAtClientX(svg, e.clientX, state.stats.totalDist);

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

  // Clicking empty preview-stage opens file picker (ignores clicks on buttons, labels, and toolbars)
  const previewStage = document.getElementById('preview-stage');
  if (previewStage) {
    previewStage.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('label') || e.target.closest('.stage-header-toolbar') || e.target.closest('.segmented-pill-group')) return;
      const state = store.getState();
      if (state.points.length < 2 || !state.stats) {
        openRouteFilePicker();
      }
    });
  }

  // Header Load GPX button click & keyboard accessibility
  const btnLoadGpx = document.getElementById('btn-load-gpx');
  if (btnLoadGpx) {
    btnLoadGpx.addEventListener('click', e => {
      e.preventDefault();
      openRouteFilePicker();
    });
    btnLoadGpx.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRouteFilePicker();
      }
    });
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
        setHTML(btnShareLink, `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Link Copied!`);
        await copyShareableLink(store.getState());
        showToast('Share link copied to clipboard', 'success');
        setTimeout(() => setHTML(btnShareLink, orig), 1800);
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
          setHTML(btnCopy, `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`);
          showToast('SVG markup copied to clipboard', 'success');
          setTimeout(() => setHTML(btnCopy, orig), 1400);
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

  // View Switcher Buttons (Elevation vs Fueling)
  const viewSwitchBtns = document.querySelectorAll('.view-switch-btn');
  viewSwitchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      store.setActiveView(view);
    });
  });

  // Sidebar Tab Switcher Buttons
  const tabBtnCues = document.getElementById('tab-btn-cues');
  if (tabBtnCues) {
    tabBtnCues.addEventListener('click', () => {
      store.setActiveView('elevation');
    });
  }
  const tabBtnFuel = document.getElementById('tab-btn-fuel');
  if (tabBtnFuel) {
    tabBtnFuel.addEventListener('click', () => {
      store.setActiveView('fueling');
    });
  }

  // Climb Detail mode toggle (elevation view)
  const btnClimbDetail = document.getElementById('btn-climb-detail');
  if (btnClimbDetail) {
    btnClimbDetail.addEventListener('click', e => {
      e.stopPropagation();
      const enable = !store.getState().climbDetail;
      store.setClimbDetail(enable);
      if (enable) {
        const n = (store.getState().climbs || []).length;
        showToast(`Climb Detail: ${n} climb sticker${n === 1 ? '' : 's'} — hide climbs in the Climbs panel to drop them`, 'info', 3200);
      }
    });
  }

  // Undo / Redo (header buttons + keyboard). Text fields keep their native undo.
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.addEventListener('click', () => store.undo());
  if (btnRedo) btnRedo.addEventListener('click', () => store.redo());

  window.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    if (isTextEditingTarget(e.target)) return;
    e.preventDefault();
    if (key === 'y' || e.shiftKey) store.redo();
    else store.undo();
  });

  window.addEventListener('beforeprint', () => {
    updatePrintMatrix(store.getState(), null, null, null, null, null, getActivePrintConfig());
  });
}

/**
 * Whether a keyboard event target is a text field whose native undo should win.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function isTextEditingTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea' || target.isContentEditable) return true;
  if (tag !== 'input') return false;
  const type = (target.type || 'text').toLowerCase();
  return ['text', 'search', 'number', 'email', 'url', 'tel', 'password'].includes(type);
}

/**
 * Enables / disables the header undo and redo buttons from store history.
 *
 * @param {Object} store - Application store
 */
export function syncHistoryButtons(store) {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = !store.canUndo();
  if (btnRedo) btnRedo.disabled = !store.canRedo();
}
