/**
 * Workbench Stage UI Module
 *
 * Renders the center preview (elevation or fueling sticker, or the empty state)
 * and syncs view-mode dependent chrome: view switcher, sidebar sections,
 * stage size label and zoom width.
 *
 * @module ui/workbench
 */

import { renderProfileSVG } from '../renderer.js';
import { renderFuelingSVG } from '../fueling-renderer.js';

/**
 * Renders the active sticker preview (or empty-state prompt) into #svg-host.
 *
 * @param {Object} state - Store state
 */
export function renderPreview(state) {
  const stats = state.stats;
  const hasData = state.points.length >= 2 && stats !== null;
  const isFuelingView = state.activeView === 'fueling';

  // 1. Render Vector Profile SVG Preview or Fueling SVG Preview
  const svgHost = document.getElementById('svg-host');
  if (svgHost) {
    if (hasData) {
      if (isFuelingView) {
        svgHost.innerHTML = renderFuelingSVG(state);
      } else {
        svgHost.innerHTML = renderProfileSVG(state);
      }
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
          <button type="button" class="btn btn-secondary empty-browse-btn" id="btn-empty-browse" style="margin-top:0.35rem; cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Choose Route File
          </button>
        </div>
      `;
    }
  }
}

/**
 * Syncs elevation vs fueling view-mode chrome across header, sidebars and stage.
 *
 * @param {Object} state - Store state
 */
export function syncViewMode(state) {
  const cfg = state.settings;
  const isFuelingView = state.activeView === 'fueling';

  // 2. View Switcher & Right Panel View Sync
  const btnViewElevation = document.getElementById('btn-view-elevation');
  const btnViewFueling = document.getElementById('btn-view-fueling');
  if (btnViewElevation) btnViewElevation.classList.toggle('active', !isFuelingView);
  if (btnViewFueling) btnViewFueling.classList.toggle('active', isFuelingView);

  const tabBtnCues = document.getElementById('tab-btn-cues');
  const tabBtnFuel = document.getElementById('tab-btn-fuel');
  if (tabBtnCues) tabBtnCues.classList.toggle('active', !isFuelingView);
  if (tabBtnFuel) tabBtnFuel.classList.toggle('active', isFuelingView);

  const panelCues = document.getElementById('panel-cues-content');
  const panelFuel = document.getElementById('panel-fuel-content');
  if (panelCues) panelCues.style.display = isFuelingView ? 'none' : 'block';
  if (panelFuel) panelFuel.style.display = isFuelingView ? 'block' : 'none';

  // Toggle elevation vs fueling stat boxes in stats strip
  const eleStatItems = document.querySelectorAll('.stat-item-elevation');
  const fuelStatItems = document.querySelectorAll('.stat-item-fueling');
  eleStatItems.forEach(el => { el.style.display = isFuelingView ? 'none' : 'flex'; });
  fuelStatItems.forEach(el => { el.style.display = isFuelingView ? 'flex' : 'none'; });

  // 5. Update Workbench Stage Sizing & Calipers
  const previewStage = document.getElementById('preview-stage');
  if (previewStage) {
    previewStage.classList.toggle('mode-fueling', isFuelingView);
  }

  const stageSizeLabel = document.getElementById('stage-size-label');
  if (stageSizeLabel) {
    if (isFuelingView) {
      const fw = cfg.fuelingWidthMm || 35;
      const fh = cfg.fuelingHeightMm || 115;
      stageSizeLabel.textContent = `${fw} × ${fh} mm (Top Tube)`;
    } else {
      stageSizeLabel.textContent = `${cfg.widthMm} × ${cfg.heightMm} mm`;
    }
  }

  // Declutter Left Sidebar: Show/hide mode-specific sections
  const elevationSections = document.querySelectorAll('.tool-section-elevation');
  elevationSections.forEach(sec => {
    sec.style.display = isFuelingView ? 'none' : 'flex';
  });
  const fuelingSections = document.querySelectorAll('.tool-section-fueling');
  fuelingSections.forEach(sec => {
    sec.style.display = isFuelingView ? 'flex' : 'none';
  });

  const stickerWrapper = document.getElementById('sticker-container');
  if (stickerWrapper && !stickerWrapper.classList.contains('zoom-actual')) {
    document.documentElement.style.setProperty('--stage-zoom-w', isFuelingView ? '260px' : '720px');
  }
}
