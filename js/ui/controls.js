/**
 * Form Controls & Visual Parameter Binding UI Module
 *
 * Binds physical sticker dimensions, roadbook block size granularity,
 * smoothing filter sliders, color themes, units, and overlay visibility checkboxes.
 *
 * @module ui/controls
 */

import { getRecommendedBlockPresets } from '../layout.js';

/**
 * Updates the block size segmented pill buttons to reflect stage distance and active settings.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function updateBlockSizePills(store) {
  const container = document.getElementById('block-size-pill-group');
  const fieldCustomBlock = document.getElementById('field-custom-block');
  const inputCustomBlock = document.getElementById('input-custom-block');
  if (!container) return;

  const state = store.getState();
  const totalDist = state.stats ? state.stats.totalDist : 0;
  const presets = getRecommendedBlockPresets(totalDist, state.settings.widthMm, state.settings.heightMm);
  const currentVal = state.settings.blockSizeM;

  let html = '';
  let matched = false;

  presets.options.forEach(opt => {
    const isSelected = (opt.value === 'custom')
      ? (!matched && currentVal !== 0 && !presets.options.some(o => o.value === currentVal))
      : (currentVal === opt.value);

    if (isSelected && opt.value !== 'custom') matched = true;
    const activeClass = isSelected ? 'active' : '';
    html += `<button type="button" class="pill-opt ${activeClass}" data-value="${opt.value}">${opt.label}</button>`;
  });

  container.innerHTML = html;

  if (matched || currentVal === 0) {
    if (fieldCustomBlock) fieldCustomBlock.style.display = 'none';
  } else {
    const customBtn = container.querySelector('[data-value="custom"]');
    if (customBtn) customBtn.classList.add('active');
    if (fieldCustomBlock) fieldCustomBlock.style.display = 'block';
    if (inputCustomBlock) inputCustomBlock.value = currentVal;
  }

  const pills = container.querySelectorAll('.pill-opt');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const val = pill.dataset.value;

      if (val === 'custom') {
        if (fieldCustomBlock) fieldCustomBlock.style.display = 'block';
        const numVal = parseInt(inputCustomBlock ? inputCustomBlock.value : presets.defaultBlockM, 10) || presets.defaultBlockM;
        store.updateSettings({ blockSizeM: numVal }, true);
      } else {
        if (fieldCustomBlock) fieldCustomBlock.style.display = 'none';
        const numVal = parseInt(val, 10);
        if (inputCustomBlock && numVal > 0) inputCustomBlock.value = numVal;
        store.updateSettings({ blockSizeM: numVal }, true);
      }
    });
  });
}

/**
 * Synchronizes all sidebar input controls, sliders, and checkboxes to match the active state.
 *
 * @param {Object} state - Current application state
 */
export function syncFormControls(state) {
  const s = state.settings;
  const isFueling = state.activeView === 'fueling';

  // Toggle visibility of preset pills according to active mode
  const elePills = document.querySelectorAll('.pill-opt-elevation');
  const fuelPills = document.querySelectorAll('.pill-opt-fueling');
  elePills.forEach(p => { p.style.display = isFueling ? 'none' : ''; });
  fuelPills.forEach(p => { p.style.display = isFueling ? '' : 'none'; });

  // Dimensions
  const curW = isFueling ? (s.fuelingWidthMm || 35) : s.widthMm;
  const curH = isFueling ? (s.fuelingHeightMm || 115) : s.heightMm;

  const wIn = document.getElementById('input-w-mm');
  if (wIn) wIn.value = curW;
  const hIn = document.getElementById('input-h-mm');
  if (hIn) hIn.value = curH;

  document.documentElement.style.setProperty('--sticker-w', `${curW}mm`);
  document.documentElement.style.setProperty('--sticker-h', `${curH}mm`);

  const stageSizeLabel = document.getElementById('stage-size-label');
  if (stageSizeLabel) {
    stageSizeLabel.textContent = isFueling
      ? `${curW} × ${curH} mm (Top Tube)`
      : `${curW} × ${curH} mm`;
  }

  // Preset pills active state matching
  const targetPreset = `${curW}x${curH}`;
  let matchedPreset = false;
  const activeModePills = isFueling ? fuelPills : elePills;
  activeModePills.forEach(p => {
    const isMatch = p.dataset.value === targetPreset;
    p.classList.toggle('active', isMatch);
    if (isMatch) matchedPreset = true;
  });
  const customPill = document.querySelector('#preset-pill-group .pill-opt[data-value="custom"]');
  if (customPill) {
    customPill.classList.toggle('active', !matchedPreset);
  }

  // Radius & copies
  const radIn = document.getElementById('input-radius');
  if (radIn) radIn.value = s.radiusMm;
  const copIn = document.getElementById('input-copies');
  if (copIn) copIn.value = s.printCopies || 2;

  // Smoothing
  const smSlider = document.getElementById('slider-smoothing');
  const smLabel = document.getElementById('label-smoothing');
  if (smSlider) smSlider.value = s.smoothingWindow;
  if (smLabel) smLabel.textContent = `${s.smoothingWindow} pt`;

  // Theme & Units
  const themeSelect = document.getElementById('select-theme');
  if (themeSelect) themeSelect.value = s.theme;
  const unitsSelect = document.getElementById('select-units');
  if (unitsSelect) unitsSelect.value = s.units;
  const unitLabel = document.getElementById('label-wpt-unit');
  if (unitLabel) unitLabel.textContent = s.units === 'metric' ? 'km' : 'mi';

  // Title
  const titleInput = document.getElementById('input-title');
  if (titleInput) titleInput.value = s.title || '';

  // Checkboxes
  const syncCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = val !== false;
  };
  syncCheck('chk-block-pct', s.showBlockPct);
  syncCheck('chk-climbs', s.showClimbs);
  syncCheck('chk-waypoints', s.showWaypoints);
  syncCheck('chk-wpt-labels', s.showWaypointLabels);
  syncCheck('chk-header', s.showHeader);
  syncCheck('chk-distance', s.showDistanceTicks);
  syncCheck('chk-ele-labels', s.showElevationLabels);
  syncCheck('chk-cut', s.showCutGuidelines);
  syncCheck('chk-fuel-header', s.showHeader);
  syncCheck('chk-fuel-cut', s.showCutGuidelines);
}

/**
 * Initializes form control listeners and two-way store binding.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initControls(store) {
  // Preset Pills
  const presetPills = document.querySelectorAll('#preset-pill-group .pill-opt');
  const presetSelect = document.getElementById('preset-size');
  const wIn = document.getElementById('input-w-mm');
  const hIn = document.getElementById('input-h-mm');

  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const isFueling = store.getState().activeView === 'fueling';
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const val = pill.dataset.value;
      if (presetSelect) presetSelect.value = val;

      if (val !== 'custom') {
        const [w, h] = val.split('x').map(Number);
        if (wIn) wIn.value = w;
        if (hIn) hIn.value = h;
        if (isFueling) {
          store.updateSettings({ fuelingWidthMm: w, fuelingHeightMm: h });
        } else {
          store.updateSettings({ widthMm: w, heightMm: h });
        }
      }
    });
  });

  if (wIn) {
    wIn.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 15 && v <= 400) {
        const isFueling = store.getState().activeView === 'fueling';
        presetPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
        if (presetSelect) presetSelect.value = 'custom';
        if (isFueling) {
          store.updateSettings({ fuelingWidthMm: v });
        } else {
          store.updateSettings({ widthMm: v });
        }
      }
    });
  }

  if (hIn) {
    hIn.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 15 && v <= 400) {
        const isFueling = store.getState().activeView === 'fueling';
        presetPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
        if (presetSelect) presetSelect.value = 'custom';
        if (isFueling) {
          store.updateSettings({ fuelingHeightMm: v });
        } else {
          store.updateSettings({ heightMm: v });
        }
      }
    });
  }

  const radiusInput = document.getElementById('input-radius');
  if (radiusInput) {
    radiusInput.addEventListener('change', e => {
      store.updateSettings({ radiusMm: parseFloat(e.target.value) || 0 });
    });
  }

  const copiesInput = document.getElementById('input-copies');
  if (copiesInput) {
    copiesInput.addEventListener('change', e => {
      store.updateSettings({ printCopies: parseInt(e.target.value, 10) || 1 });
    });
  }

  // Custom block size
  const inputCustomBlock = document.getElementById('input-custom-block');
  if (inputCustomBlock) {
    inputCustomBlock.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 50 && v <= 50000) {
        const container = document.getElementById('block-size-pill-group');
        if (container) {
          container.querySelectorAll('.pill-opt').forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
        }
        store.updateSettings({ blockSizeM: v }, true);
      }
    });
  }

  // Smoothing
  const smSlider = document.getElementById('slider-smoothing');
  const smLabel = document.getElementById('label-smoothing');
  if (smSlider && smLabel) {
    smSlider.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      smLabel.textContent = `${v} pt`;
      store.updateSettings({ smoothingWindow: v }, true);
    });
  }

  // Theme & Units
  const themeSelect = document.getElementById('select-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', e => {
      store.updateSettings({ theme: e.target.value });
    });
  }

  const unitsSelect = document.getElementById('select-units');
  if (unitsSelect) {
    unitsSelect.addEventListener('change', e => {
      store.updateSettings({ units: e.target.value });
    });
  }

  const titleInput = document.getElementById('input-title');
  if (titleInput) {
    titleInput.addEventListener('input', e => {
      store.updateSettings({ title: e.target.value });
    });
  }

  // Checkboxes
  const bindCheck = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', e => {
        store.updateSettings({ [key]: e.target.checked });
      });
    }
  };

  bindCheck('chk-block-pct', 'showBlockPct');
  bindCheck('chk-climbs', 'showClimbs');
  bindCheck('chk-waypoints', 'showWaypoints');
  bindCheck('chk-wpt-labels', 'showWaypointLabels');
  bindCheck('chk-header', 'showHeader');
  bindCheck('chk-distance', 'showDistanceTicks');
  bindCheck('chk-ele-labels', 'showElevationLabels');
  bindCheck('chk-cut', 'showCutGuidelines');
  bindCheck('chk-fuel-header', 'showHeader');
  bindCheck('chk-fuel-cut', 'showCutGuidelines');

  // Initial sync
  updateBlockSizePills(store);
  syncFormControls(store.getState());
}
