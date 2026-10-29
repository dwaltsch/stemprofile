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

import {
  FUEL_PRESETS,
  DEFAULT_FUEL_PRODUCT_DEFAULTS,
  findNearestSafeWindow,
  calculateHourlyIntake
} from '../fueling.js';
import { getUnitFactors, getUnitLabels } from '../units.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../escape.js';

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

  const inputTargetCarbs = document.getElementById('input-fuel-target-carbs');
  const inputAvgSpeed = document.getElementById('input-fuel-avg-speed');
  if (inputTargetCarbs && document.activeElement !== inputTargetCarbs) {
    inputTargetCarbs.value = targetCarbs;
  }
  const labelTargetCarbs = document.getElementById('label-fuel-target-carbs');
  if (labelTargetCarbs) {
    labelTargetCarbs.textContent = `${targetCarbs}g`;
  }
  if (inputAvgSpeed && document.activeElement !== inputAvgSpeed) {
    inputAvgSpeed.value = avgSpeed;
  }

  // 1b. Sync Product Defaults Drawer Inputs & Quick-Add Badge Labels
  const defs = fState.productDefaults || DEFAULT_FUEL_PRODUCT_DEFAULTS;

  const defGel = document.getElementById('def-gel-carbs');
  const defBottle = document.getElementById('def-bottle-carbs');
  const defFluid = document.getElementById('def-bottle-fluid');
  const defBar = document.getElementById('def-bar-carbs');
  const defHc = document.getElementById('def-hc-carbs');
  const defCaff = document.getElementById('def-caff-carbs');

  if (defGel && document.activeElement !== defGel) defGel.value = defs.gelCarbs ?? 25;
  if (defBottle && document.activeElement !== defBottle) defBottle.value = defs.bottleCarbs ?? 40;
  if (defFluid && document.activeElement !== defFluid) defFluid.value = defs.bottleFluidMl ?? 500;
  if (defBar && document.activeElement !== defBar) defBar.value = defs.barCarbs ?? 35;
  if (defHc && document.activeElement !== defHc) defHc.value = defs.hcGelCarbs ?? 40;
  if (defCaff && document.activeElement !== defCaff) defCaff.value = defs.caffGelCarbs ?? 30;

  const chipGel = document.getElementById('chip-gel-carbs');
  const chipBottle = document.getElementById('chip-bottle-carbs');
  const chipBar = document.getElementById('chip-bar-carbs');
  const chipHc = document.getElementById('chip-hc-carbs');
  const chipCaff = document.getElementById('chip-caff-carbs');

  if (chipGel) chipGel.textContent = `${defs.gelCarbs ?? 25}g`;
  if (chipBottle) chipBottle.textContent = `${defs.bottleCarbs ?? 40}g`;
  if (chipBar) chipBar.textContent = `${defs.barCarbs ?? 35}g`;
  if (chipHc) chipHc.textContent = `${defs.hcGelCarbs ?? 40}g`;
  if (chipCaff) chipCaff.textContent = `${defs.caffGelCarbs ?? 30}g`;

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

  // Preserve focus & cursor position if user is actively editing inside list
  const activeEl = document.activeElement;
  const isEditingInList = activeEl && listEl && listEl.contains(activeEl);
  const activeId = isEditingInList ? activeEl.dataset.id : null;
  const activeAction = isEditingInList ? activeEl.dataset.action : null;
  const selStart = isEditingInList && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;
  const selEnd = isEditingInList && typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : null;

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
          <button type="button" class="btn-snap-flat" data-action="snap-flat" data-id="${escapeHtml(item.id)}" title="Snap to nearest safe flat corridor">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span>Snap</span>
          </button>
        </div>
      `;
    }

    let indexBadgeMarkup = '';
    if (displayMode === 'time') {
      indexBadgeMarkup = `<span class="fuel-index-badge">${indexStr}</span>`;
    } else {
      indexBadgeMarkup = `
        <div class="fuel-dist-badge" title="Click to edit kilometer">
          <input type="number" class="fuel-dist-input" data-action="edit-dist" data-id="${escapeHtml(item.id)}" value="${distU}" step="0.5" min="0" max="1000" draggable="false">
          <span class="fuel-dist-unit">${distUnit}</span>
        </div>
      `;
    }

    const typeKey = (item.type || 'gel').toLowerCase();
    let badgeClass = 'code-gel';
    if (typeKey.includes('caff')) {
      badgeClass = 'code-caff';
    } else if (typeKey.includes('high_carb') || typeKey === 'hc') {
      badgeClass = 'code-hc';
    } else if (typeKey.includes('mix') || typeKey.includes('bottle')) {
      badgeClass = 'code-mix';
    } else if (typeKey.includes('bar')) {
      badgeClass = 'code-bar';
    } else if (typeKey.includes('aid') || typeKey.includes('feed')) {
      badgeClass = 'code-aid';
    } else if (typeKey.includes('water') || typeKey.includes('h2o')) {
      badgeClass = 'code-h2o';
    }

    const isGel = typeKey === 'gel';
    const isMix = typeKey.includes('mix') || typeKey.includes('bottle');
    const isBar = typeKey.includes('bar');
    const isHc = typeKey.includes('high_carb') || typeKey === 'hc';
    const isCaff = typeKey.includes('caff');
    const isAid = typeKey.includes('feed') || typeKey.includes('aid');
    const isWater = typeKey.includes('water') || typeKey.includes('h2o');

    html += `
      <div class="fuel-item-card" data-id="${escapeHtml(item.id)}" data-index="${index}">
        <div class="fuel-card-handle" draggable="true" title="Drag to reorder item">
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
          <div class="fuel-card-meta-row">
            <div class="fuel-card-meta-left">
              ${indexBadgeMarkup}
              <select class="fuel-type-select ${badgeClass}" data-action="edit-type" data-id="${escapeHtml(item.id)}" title="Product type (Click to change)" draggable="false">
                <option value="gel" ${isGel ? 'selected' : ''}>GEL</option>
                <option value="bottle_mix" ${isMix ? 'selected' : ''}>MIX</option>
                <option value="bar" ${isBar ? 'selected' : ''}>BAR</option>
                <option value="gel_high_carb" ${isHc ? 'selected' : ''}>HC</option>
                <option value="caff_gel" ${isCaff ? 'selected' : ''}>CAF</option>
                <option value="feed_zone" ${isAid ? 'selected' : ''}>AID</option>
                <option value="water" ${isWater ? 'selected' : ''}>H2O</option>
              </select>
            </div>
            <div class="fuel-card-meta-right">
              <div class="fuel-carbs-pill" title="Click to edit carbs (g)">
                <input type="number" class="fuel-carbs-input" data-action="edit-carbs" data-id="${escapeHtml(item.id)}" value="${item.carbsG || 0}" min="0" max="140" step="5" draggable="false">
                <span>g</span>
              </div>
              <button type="button" class="fuel-del-btn" data-action="delete" data-id="${escapeHtml(item.id)}" title="Remove item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <div class="fuel-card-name-row">
            <input type="text" class="fuel-name-input" data-action="edit-name" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.name || '')}" placeholder="Item name (e.g. Maurten Gel 100)" maxlength="40" draggable="false" title="Click to edit name" autocomplete="off" spellcheck="false">
          </div>

          ${hazardMarkup ? `<div class="fuel-card-hazard-row">${hazardMarkup}</div>` : ''}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
  bindDragAndDrop(store, listEl);

  // Restore active input focus and cursor selection range
  if (activeId && activeAction) {
    const restoredEl = listEl.querySelector(`[data-action="${activeAction}"][data-id="${activeId}"]`);
    if (restoredEl) {
      restoredEl.focus();
      if (selStart !== null && selEnd !== null && typeof restoredEl.setSelectionRange === 'function') {
        try {
          restoredEl.setSelectionRange(selStart, selEnd);
        } catch (_) {}
      }
    }
  }
}

/**
 * Binds drag-and-drop reordering listeners to the items list via handle.
 *
 * @param {import('../store.js').StemStore} store
 * @param {HTMLElement} listEl
 */
function bindDragAndDrop(store, listEl) {
  let draggedIndex = null;

  const cards = listEl.querySelectorAll('.fuel-item-card');
  cards.forEach(card => {
    const handle = card.querySelector('.fuel-card-handle');
    if (handle) {
      handle.setAttribute('draggable', 'true');
      handle.addEventListener('dragstart', e => {
        draggedIndex = parseInt(card.dataset.index, 10);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(draggedIndex));
        } catch (_) {}
      });

      handle.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        cards.forEach(c => c.classList.remove('drag-over'));
        draggedIndex = null;
      });
    }

    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('drag-over');
      }
    });

    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetIndex = parseInt(card.dataset.index, 10);
      if (draggedIndex !== null && !isNaN(targetIndex) && draggedIndex !== targetIndex) {
        store.reorderFuelItems(draggedIndex, targetIndex);
        showToast('Fuel cues reordered', 'info');
      }
      draggedIndex = null;
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

  // 1. Target Carbs Input
  if (inputTargetCarbs) {
    const handleTargetChange = (e) => {
      const val = parseInt(e.target.value, 10) || 75;
      if (labelTargetCarbs) labelTargetCarbs.textContent = `${val}g`;
      store.updateFuelSettings({ targetCarbsPerHour: val });
    };
    inputTargetCarbs.addEventListener('input', handleTargetChange);
    inputTargetCarbs.addEventListener('change', handleTargetChange);
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

  // 4b. Product Defaults Drawer & Config Handlers
  const btnToggleDefaults = document.getElementById('btn-toggle-fuel-defaults');
  const btnCloseDefaults = document.getElementById('btn-close-fuel-defaults');
  const defaultsDrawer = document.getElementById('fuel-defaults-drawer');

  if (btnToggleDefaults && defaultsDrawer) {
    btnToggleDefaults.addEventListener('click', () => {
      const isVisible = defaultsDrawer.style.display !== 'none';
      defaultsDrawer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        btnToggleDefaults.classList.add('active');
      } else {
        btnToggleDefaults.classList.remove('active');
      }
    });
  }

  if (btnCloseDefaults && defaultsDrawer) {
    btnCloseDefaults.addEventListener('click', () => {
      defaultsDrawer.style.display = 'none';
      if (btnToggleDefaults) btnToggleDefaults.classList.remove('active');
    });
  }

  const bindDefaultInput = (id, propName) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const val = parseInt(el.value, 10);
      if (!isNaN(val) && val > 0) {
        store.updateProductDefaults({ [propName]: val }, false);
      }
    });
  };

  bindDefaultInput('def-gel-carbs', 'gelCarbs');
  bindDefaultInput('def-bottle-carbs', 'bottleCarbs');
  bindDefaultInput('def-bottle-fluid', 'bottleFluidMl');
  bindDefaultInput('def-bar-carbs', 'barCarbs');
  bindDefaultInput('def-hc-carbs', 'hcGelCarbs');
  bindDefaultInput('def-caff-carbs', 'caffGelCarbs');

  const btnApplyDefaults = document.getElementById('btn-apply-defaults-existing');
  if (btnApplyDefaults) {
    btnApplyDefaults.addEventListener('click', () => {
      const state = store.getState();
      const currentDefs = state.fueling?.productDefaults || DEFAULT_FUEL_PRODUCT_DEFAULTS;
      store.updateProductDefaults(currentDefs, true);
      showToast('Applied defaults to all existing plan items', 'success');
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
    // Prevent drag interference or parent click handling when interacting with inputs
    listEl.addEventListener('mousedown', e => {
      if (e.target.closest('input, button, select, textarea')) {
        e.stopPropagation();
      }
    });
    listEl.addEventListener('pointerdown', e => {
      if (e.target.closest('input, button, select, textarea')) {
        e.stopPropagation();
      }
    });

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

    const commitInput = (input) => {
      const action = input.dataset.action;
      const id = input.dataset.id;
      if (!action || !id) return;

      const state = store.getState();
      const currentItem = (state.fueling?.items || []).find(it => it.id === id);
      if (!currentItem) return;

      if (action === 'edit-dist') {
        const { dFactor } = getUnitFactors(state.settings.units);
        const val = Math.max(0, parseFloat(input.value) || 0);
        const distM = Math.round(val / dFactor);
        if (distM !== currentItem.distM) {
          store.updateFuelItem(id, { distM });
        }
      } else if (action === 'edit-carbs') {
        const val = Math.max(0, parseInt(input.value, 10) || 0);
        if (val !== currentItem.carbsG) {
          store.updateFuelItem(id, { carbsG: val });
        }
      } else if (action === 'edit-name') {
        const newName = input.value.trim() || 'Fuel';
        if (newName !== currentItem.name) {
          store.updateFuelItem(id, { name: newName });
        }
      }
    };

    listEl.addEventListener('change', e => {
      if (e.target.matches('select[data-action="edit-type"]')) {
        const select = e.target;
        const id = select.dataset.id;
        const newType = select.value;
        const state = store.getState();
        const defs = state.fueling?.productDefaults || DEFAULT_FUEL_PRODUCT_DEFAULTS;
        let shortCode = 'GEL';
        let icon = '⚡';
        let carbsG = defs.gelCarbs ?? 25;
        let fluidMl = 0;
        let defaultName = 'Gel';

        if (newType === 'bottle_mix') {
          shortCode = 'MIX';
          icon = '🍾';
          carbsG = defs.bottleCarbs ?? 40;
          fluidMl = defs.bottleFluidMl ?? 500;
          defaultName = 'Carb Mix';
        } else if (newType === 'bar') {
          shortCode = 'BAR';
          icon = '🍫';
          carbsG = defs.barCarbs ?? 35;
          defaultName = 'Bar';
        } else if (newType === 'gel_high_carb') {
          shortCode = 'HC';
          icon = '⚡⚡';
          carbsG = defs.hcGelCarbs ?? 40;
          defaultName = 'HC Gel';
        } else if (newType === 'caff_gel') {
          shortCode = 'CAF';
          icon = '☕';
          carbsG = defs.caffGelCarbs ?? 30;
          defaultName = 'Caff Gel';
        } else if (newType === 'feed_zone') {
          shortCode = 'AID';
          icon = '🏁';
          carbsG = defs.bottleCarbs ?? 40;
          fluidMl = defs.bottleFluidMl ?? 500;
          defaultName = 'Feed Zone';
        } else if (newType === 'water') {
          shortCode = 'H2O';
          icon = '💧';
          carbsG = 0;
          fluidMl = defs.bottleFluidMl ?? 500;
          defaultName = 'Water';
        }

        const currentItem = (state.fueling?.items || []).find(it => it.id === id);
        const updates = {
          type: newType,
          shortCode,
          icon,
          carbsG,
          fluidMl
        };
        if (!currentItem || !currentItem.name || ['Gel', 'Carb Mix', 'Bar', 'HC Gel', 'Caff Gel', 'Feed Zone', 'Water', 'Fuel Item'].includes(currentItem.name)) {
          updates.name = defaultName;
        }
        store.updateFuelItem(id, updates);
        return;
      }

      if (e.target.matches('input[data-action]')) {
        commitInput(e.target);
      }
    });

    listEl.addEventListener('focusout', e => {
      if (e.target.matches('input[data-action]')) {
        commitInput(e.target);
      }
    });

    listEl.addEventListener('keydown', e => {
      const input = e.target;
      if (!input || !input.matches('input[data-action]')) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        commitInput(input);
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const state = store.getState();
        const item = (state.fueling?.items || []).find(it => it.id === input.dataset.id);
        if (item) {
          if (input.dataset.action === 'edit-name') {
            input.value = item.name || '';
          } else if (input.dataset.action === 'edit-carbs') {
            input.value = item.carbsG || 0;
          } else if (input.dataset.action === 'edit-dist') {
            const { dFactor } = getUnitFactors(state.settings.units);
            input.value = (item.distM * dFactor).toFixed(item.distM >= 100000 ? 0 : 1);
          }
        }
        input.blur();
      }
    });
  }
}
