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

import { DEFAULT_FUEL_PRODUCT_DEFAULTS, FUEL_PRESETS, findNearestSafeWindow } from '../fueling.js';
import { getUnitFactors } from '../units.js';
import { showToast } from './toast.js';

export { renderFuelingPanel } from './fueling/list.js';

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

  // 2b. Pacing Model Toggle (Terrain vs Constant)
  document.querySelectorAll('#fuel-pacing-pill-group .pill-opt').forEach(pill => {
    pill.addEventListener('click', () => {
      const pacingMode = pill.dataset.pacing === 'constant' ? 'constant' : 'terrain';
      store.updateFuelSettings({ pacingMode });
      showToast(pacingMode === 'terrain' ? 'Gradient-aware pacing: cue times follow climbs & descents' : 'Constant-speed pacing', 'info');
    });
  });

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
