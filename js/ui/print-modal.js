/**
 * Interactive Print Studio & Print Sheet Setup Modal UI Module
 *
 * Provides a WYSIWYG live print preview workstation allowing cyclists to
 * configure multi-sticker sheet copies, paper dimensions (A4, Letter),
 * cutting crop marks, 50mm calibration verification rulers, and color themes
 * before printing or downloading high-resolution sheets.
 *
 * @module ui/print-modal
 */

import {
  DEFAULT_PRINT_CONFIG,
  generatePrintSheetMarkup,
  updatePrintMatrix,
  exportSheetSVG,
  exportSheetPNG
} from '../export.js';
import { showToast } from './toast.js';
import { setHTML } from './html.js';

let activePrintConfig = { ...DEFAULT_PRINT_CONFIG };
let currentStore = null;

/**
 * Returns current active print configuration.
 * @returns {Object}
 */
export function getActivePrintConfig() {
  return { ...activePrintConfig };
}

/**
 * Updates active print configuration.
 * @param {Object} partial
 */
export function setPrintConfig(partial) {
  activePrintConfig = { ...activePrintConfig, ...partial };
}

/**
 * Updates the miniature live print sheet preview inside the modal dialog.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function updatePrintModalPreview(store) {
  if (!store) return;
  const state = store.getState();
  const previewHost = document.getElementById('print-paper-sheet');
  const previewMeta = document.getElementById('print-preview-meta');
  if (!previewHost) return;

  const result = generatePrintSheetMarkup(state, activePrintConfig);
  setHTML(previewHost, result.html);

  if (previewMeta) {
    const paperName = (activePrintConfig.paper || 'a4').toUpperCase();
    const themeName = activePrintConfig.printTheme === 'white' ? 'Ink-Saver White' : (state.settings.theme || 'Active Theme');
    previewMeta.textContent = `${paperName} · ${result.count} ${result.count === 1 ? 'Copy' : 'Copies'} · ${result.stickerW}×${result.stickerH}mm · ${themeName}`;
  }

  // Also sync the real hidden #print-matrix in background
  updatePrintMatrix(state, null, null, null, null, null, activePrintConfig);
}

/**
 * Opens the Print Studio modal dialog and renders live sheet preview.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function openPrintModal(store) {
  currentStore = store;
  const modal = document.getElementById('modal-print-studio');
  if (!modal) return;

  const state = store.getState();
  activePrintConfig.copies = parseInt(state.settings.printCopies, 10) || activePrintConfig.copies || 2;

  syncPrintModalForm(state);
  updatePrintModalPreview(store);

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  // Trap focus / focus on print button
  const triggerBtn = document.getElementById('btn-trigger-print');
  if (triggerBtn) setTimeout(() => triggerBtn.focus(), 50);
}

/**
 * Closes the Print Studio modal dialog.
 */
export function closePrintModal() {
  const modal = document.getElementById('modal-print-studio');
  if (!modal) return;

  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

/**
 * Synchronizes modal UI controls with active configuration.
 *
 * @private
 * @param {Object} state - Store state snapshot
 */
function syncPrintModalForm(state) {
  // Sticker Type pills
  const typePills = document.querySelectorAll('#print-type-pill-group .pill-opt');
  typePills.forEach(p => {
    const type = p.dataset.stickerType;
    p.classList.toggle('active', type === (activePrintConfig.stickerType || 'active'));
  });

  // Copies pills
  const copiesPills = document.querySelectorAll('#print-copies-pill-group .pill-opt');
  copiesPills.forEach(p => {
    const val = parseInt(p.dataset.copies, 10);
    p.classList.toggle('active', val === activePrintConfig.copies);
  });

  // Theme pills
  const themePills = document.querySelectorAll('#print-theme-pill-group .pill-opt');
  themePills.forEach(p => {
    const mode = p.dataset.themeMode;
    p.classList.toggle('active', mode === activePrintConfig.printTheme);
  });

  // Paper & Orientation
  const paperSelect = document.getElementById('select-print-paper');
  if (paperSelect) paperSelect.value = activePrintConfig.paper || 'a4';

  const orientSelect = document.getElementById('select-print-orient');
  if (orientSelect) orientSelect.value = activePrintConfig.orientation || 'auto';

  // Checkboxes
  const syncCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = val !== false;
  };
  syncCheck('chk-print-crop', activePrintConfig.showCropMarks);
  syncCheck('chk-print-cutlines', activePrintConfig.showCutLines);
  syncCheck('chk-print-ruler', activePrintConfig.showRuler);
  syncCheck('chk-print-header', activePrintConfig.showHeader);
}

/**
 * Initializes Print Studio modal event bindings and action triggers.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initPrintModal(store) {
  currentStore = store;

  const modal = document.getElementById('modal-print-studio');
  const btnClose = document.getElementById('btn-close-print-modal');
  const btnCancel = document.getElementById('btn-cancel-print');
  const btnTrigger = document.getElementById('btn-trigger-print');
  const btnExportSvg = document.getElementById('btn-export-sheet-svg');
  const btnExportPng = document.getElementById('btn-export-sheet-png');

  // Close handlers
  if (btnClose) btnClose.addEventListener('click', closePrintModal);
  if (btnCancel) btnCancel.addEventListener('click', closePrintModal);
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closePrintModal();
    });
  }

  // Escape key closes modal
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
      closePrintModal();
    }
  });

  // Sticker Type pills
  const typePills = document.querySelectorAll('#print-type-pill-group .pill-opt');
  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      typePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activePrintConfig.stickerType = pill.dataset.stickerType || 'active';
      updatePrintModalPreview(store);
    });
  });

  // Copies pills
  const copiesPills = document.querySelectorAll('#print-copies-pill-group .pill-opt');
  copiesPills.forEach(pill => {
    pill.addEventListener('click', () => {
      copiesPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const count = parseInt(pill.dataset.copies, 10) || 2;
      activePrintConfig.copies = count;
      store.updateSettings({ printCopies: count });
      updatePrintModalPreview(store);
    });
  });

  // Theme pills
  const themePills = document.querySelectorAll('#print-theme-pill-group .pill-opt');
  themePills.forEach(pill => {
    pill.addEventListener('click', () => {
      themePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activePrintConfig.printTheme = pill.dataset.themeMode || 'theme';
      updatePrintModalPreview(store);
    });
  });

  // Paper format
  const paperSelect = document.getElementById('select-print-paper');
  if (paperSelect) {
    paperSelect.addEventListener('change', e => {
      activePrintConfig.paper = e.target.value;
      updatePrintModalPreview(store);
    });
  }

  // Orientation
  const orientSelect = document.getElementById('select-print-orient');
  if (orientSelect) {
    orientSelect.addEventListener('change', e => {
      activePrintConfig.orientation = e.target.value;
      updatePrintModalPreview(store);
    });
  }

  // Checkboxes
  const bindCheck = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', e => {
        activePrintConfig[key] = e.target.checked;
        updatePrintModalPreview(store);
      });
    }
  };

  bindCheck('chk-print-crop', 'showCropMarks');
  bindCheck('chk-print-cutlines', 'showCutLines');
  bindCheck('chk-print-ruler', 'showRuler');
  bindCheck('chk-print-header', 'showHeader');

  // Trigger Print Button
  if (btnTrigger) {
    btnTrigger.addEventListener('click', () => {
      updatePrintMatrix(store.getState(), null, null, null, null, null, activePrintConfig);
      window.print();
    });
  }

  // Export Sheet SVG
  if (btnExportSvg) {
    btnExportSvg.addEventListener('click', () => {
      showToast('Downloading Print Sheet SVG...', 'info');
      exportSheetSVG(store.getState(), activePrintConfig);
    });
  }

  // Export Sheet PNG (300 DPI)
  if (btnExportPng) {
    btnExportPng.addEventListener('click', () => {
      showToast('Rasterizing 300 DPI Print Sheet PNG...', 'info');
      exportSheetPNG(store.getState(), activePrintConfig, err => {
        if (err) {
          showToast('Failed to export sheet PNG: ' + err.message, 'error');
        } else {
          showToast('Print Sheet PNG saved!', 'success');
        }
      });
    });
  }
}
