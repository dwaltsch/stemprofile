/**
 * Fueling Strategy & Nutrition Panel UI Module
 *
 * Manages the interactive fueling workbench:
 * 1. View switching between Elevation Profile and Fueling Cue Sheet
 * 2. Draggable & editable list of fueling items and aid stations
 * 3. Carbohydrate target controls (g/h) & average speed pacing
 * 4. Display index toggle: Kilometers (`km`) vs Elapsed Time (`time`)
 * 5. Terrain gradient hazard alerts & one-click "Snap to Flat" auto-shift
 * 6. Hourly carbohydrate distribution meter (bonk risk gauge)
 * 7. Quick-add nutrition presets (Gels, Bottles, Bars, Aid Stations, Water)
 *
 * @module ui/fueling-panel
 */

import { FUEL_PRESETS, findNearestSafeWindow, calculateHourlyIntake } from '../fueling.js';
import { getUnitFactors, getUnitLabels } from '../units.js';
import { showToast } from './toast.js';

/**
 * Escapes XML/HTML text.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders the fueling cues list and hourly intake meter.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function renderFuelingPanel(store) {
  const listEl = document.getElementById('fuel-list');
  const emptyHint = document.getElementById('fuel-empty-hint');
  const countBadge = document.getElementById('fuel-count-badge');
  const hourlyHost = document.getElementById('fuel-hourly-chart');
  const summaryTotalCarbs = document.getElementById('fuel-stat-total-carbs');
  const summaryRate = document.getElementById('fuel-stat-rate');
  const summaryFluid = document.getElementById('fuel-stat-fluid');

  if (!listEl) return;

  const state = store.getState();
  const fState = state.fueling || {};
  const items = fState.items || [];
  const stats = state.stats || { totalDist: 0 };
  const settings = state.settings || {};

  if (countBadge) countBadge.textContent = `${items.length}`;

  const { dFactor } = getUnitFactors(settings.units);
  const { dist: distUnit } = getUnitLabels(settings.units);
  const displayMode = fState.mode || 'km';
  const avgSpeed = fState.avgSpeedKmh || 25;
  const targetCarbs = fState.targetCarbsPerHour || 75;

  // 1. Calculate & Render Hourly Carb Distribution
  const intake = calculateHourlyIntake(items, stats.totalDist, avgSpeed);

  if (summaryTotalCarbs) summaryTotalCarbs.textContent = `${intake.totalCarbsG}g`;
  if (summaryRate) summaryRate.textContent = `${intake.avgCarbsPerHour}g/h`;
  if (summaryFluid) summaryFluid.textContent = `${intake.totalFluidMl}ml`;

  if (hourlyHost) {
    if (intake.hours.length === 0 || stats.totalDist <= 0) {
      hourlyHost.innerHTML = '<div class="hourly-empty">Load route to preview hourly pacing</div>';
    } else {
      let chartHtml = '<div class="hourly-bars-track">';
      intake.hours.forEach(h => {
        const pctOfTarget = Math.min(150, Math.round((h.carbsG / targetCarbs) * 100));
        let colorClass = 'bar-on-target';
        if (pctOfTarget < 50) colorClass = 'bar-critical';
        else if (pctOfTarget < 75) colorClass = 'bar-warning';

        chartHtml += `
          <div class="hourly-bar-col" title="Hour ${h.hour}: ${h.carbsG}g CHO (${pctOfTarget}% of target)">
            <div class="hourly-bar-wrapper">
              <div class="hourly-bar-fill ${colorClass}" style="height: ${Math.min(100, pctOfTarget)}%;"></div>
            </div>
            <span class="hourly-bar-val">${h.carbsG}g</span>
            <span class="hourly-bar-lbl">H${h.hour}</span>
          </div>
        `;
      });
      chartHtml += '</div>';
      hourlyHost.innerHTML = chartHtml;
    }
  }

  // 2. Render Fueling Item Cards
  if (items.length === 0) {
    if (emptyHint) emptyHint.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }

  if (emptyHint) emptyHint.style.display = 'none';

  let html = '';
  items.forEach((item, index) => {
    const distU = (item.distM * dFactor).toFixed(item.distM >= 100000 ? 0 : 1);
    const indexStr = displayMode === 'time' ? (item.timeStr || '0:00 h') : `${distU} ${distUnit}`;
    const isClimb = item.hazardType === 'climb';

    let hazardMarkup = '';
    if (item.isHazard) {
      const hazardTitle = escapeHtml(item.hazardMessage || 'Hazard');
      const badgeClass = isClimb ? 'hazard-climb' : 'hazard-descent';
      const badgeText = isClimb ? `▲ ${Math.abs(item.grade || 0)}% Climb` : `▼ ${Math.abs(item.grade || 0)}% Descent`;

      hazardMarkup = `
        <div class="fuel-hazard-chip ${badgeClass}" title="${hazardTitle}">
          <span>${badgeText}</span>
          <button type="button" class="btn-snap-flat" data-action="snap-flat" data-id="${item.id}" title="Snap to nearest safe flat corridor">
            🪄 Snap
          </button>
        </div>
      `;
    }

    html += `
      <div class="fuel-item-card" data-id="${item.id}" data-index="${index}" draggable="true">
        <div class="fuel-card-handle" title="Drag to reorder item">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="6" r="1.5"></circle>
            <circle cx="15" cy="6" r="1.5"></circle>
            <circle cx="9" cy="12" r="1.5"></circle>
            <circle cx="15" cy="12" r="1.5"></circle>
            <circle cx="9" cy="18" r="1.5"></circle>
            <circle cx="15" cy="18" r="1.5"></circle>
          </svg>
        </div>

        <div class="fuel-card-body">
          <div class="fuel-card-header">
            <span class="fuel-index-badge">${indexStr}</span>
            <span class="fuel-icon-glyph">${item.icon || '⚡'}</span>
            <input type="text" class="fuel-name-input" data-action="edit-name" data-id="${item.id}" value="${escapeHtml(item.name || '')}" placeholder="Item name" maxlength="32">
            <div class="fuel-carbs-pill">
              <input type="number" class="fuel-carbs-input" data-action="edit-carbs" data-id="${item.id}" value="${item.carbsG || 0}" min="0" max="120" step="5">
              <span>g</span>
            </div>
            <button type="button" class="fuel-del-btn" data-action="delete" data-id="${item.id}" title="Remove item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>

          ${hazardMarkup ? `<div class="fuel-card-hazard-row">${hazardMarkup}</div>` : ''}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
  bindDragAndDrop(store, listEl);
}

/**
 * Binds drag-and-drop reordering listeners to the items list.
 *
 * @param {import('../store.js').StemStore} store
 * @param {HTMLElement} listEl
 */
function bindDragAndDrop(store, listEl) {
  let draggedIndex = null;

  const cards = listEl.querySelectorAll('.fuel-item-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      draggedIndex = parseInt(card.dataset.index, 10);
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      cards.forEach(c => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetIndex = parseInt(card.dataset.index, 10);
      if (draggedIndex !== null && targetIndex !== null && draggedIndex !== targetIndex) {
        store.reorderFuelItems(draggedIndex, targetIndex);
        showToast('Fuel cues reordered', 'info');
      }
    });
  });
}

/**
 * Initializes form listeners, quick presets, and mode switches for fueling panel.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initFuelingPanel(store) {
  const listEl = document.getElementById('fuel-list');
  const btnRegenerate = document.getElementById('btn-fuel-regenerate');
  const inputTargetCarbs = document.getElementById('input-fuel-target-carbs');
  const labelTargetCarbs = document.getElementById('label-fuel-target-carbs');
  const inputAvgSpeed = document.getElementById('input-fuel-avg-speed');
  const modePills = document.querySelectorAll('#fuel-mode-pill-group .pill-opt');

  // 1. Target Carbs Slider / Input
  if (inputTargetCarbs) {
    inputTargetCarbs.addEventListener('input', e => {
      const val = parseInt(e.target.value, 10) || 75;
      if (labelTargetCarbs) labelTargetCarbs.textContent = `${val}g`;
      store.updateFuelSettings({ targetCarbsPerHour: val });
    });
  }

  // 2. Average Speed Input
  if (inputAvgSpeed) {
    inputAvgSpeed.addEventListener('change', e => {
      const val = parseFloat(e.target.value) || 25;
      store.updateFuelSettings({ avgSpeedKmh: val });
    });
  }

  // 3. Display Mode Toggle (KM vs Time)
  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      modePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const mode = pill.dataset.mode;
      store.updateFuelSettings({ mode });
      showToast(`Indexed by ${mode === 'time' ? 'Elapsed Time (HH:MM)' : 'Kilometers (KM)'}`, 'info');
    });
  });

  // 4. Regenerate Pro Plan Button
  if (btnRegenerate) {
    btnRegenerate.addEventListener('click', () => {
      store.regenerateFuelPlan();
      showToast('Generated recommended pro fueling strategy', 'success');
    });
  }

  // 5. Quick Preset Add Buttons
  const presetBtns = document.querySelectorAll('[data-fuel-preset]');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.fuelPreset;
      const preset = FUEL_PRESETS[presetKey];
      if (!preset) return;

      const state = store.getState();
      const items = state.fueling.items || [];
      const stats = state.stats;

      // Default distance: either halfway past the last item, or next 10km increment
      let nextDistM = 15000;
      if (items.length > 0) {
        nextDistM = items[items.length - 1].distM + 10000;
      }
      if (stats && stats.totalDist > 0) {
        nextDistM = Math.min(stats.totalDist - 1000, nextDistM);
      }

      store.addFuelItem({
        distM: nextDistM,
        name: preset.name,
        type: preset.type,
        icon: preset.icon,
        carbsG: preset.carbsG,
        fluidMl: preset.fluidMl
      });

      showToast(`Added ${preset.name}`, 'success');
    });
  });

  // 6. Inline List Item Actions (Delete, Edit Carbs, Edit Name, Snap Flat)
  if (listEl) {
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action || !id) return;

      if (action === 'delete') {
        store.removeFuelItem(id);
        showToast('Removed fueling item', 'info');
      } else if (action === 'snap-flat') {
        const state = store.getState();
        const item = (state.fueling.items || []).find(it => it.id === id);
        if (item) {
          const safeD = findNearestSafeWindow(state.points, item.distM, 3000, 'backward');
          store.updateFuelItem(id, { distM: safeD });
          showToast(`Snapped item to safe flat corridor (${(safeD / 1000).toFixed(1)} km)`, 'success');
        }
      }
    });

    listEl.addEventListener('change', e => {
      const input = e.target;
      const action = input.dataset.action;
      const id = input.dataset.id;
      if (!action || !id) return;

      if (action === 'edit-carbs') {
        const val = Math.max(0, parseInt(input.value, 10) || 0);
        store.updateFuelItem(id, { carbsG: val });
      } else if (action === 'edit-name') {
        store.updateFuelItem(id, { name: input.value.trim() });
      }
    });
  }
}
