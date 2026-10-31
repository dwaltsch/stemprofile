/**
 * Renders the fueling cue list, hazard alerts and hourly carbohydrate meter.
 *
 * @module ui/fueling/list
 */

import { DEFAULT_FUEL_PRODUCT_DEFAULTS, calculateHourlyIntake, getStatePacing } from '../../fueling.js';
import { bindDragAndDrop } from './drag-sort.js';
import { escapeHtml } from '../../escape.js';
import { getUnitFactors, getUnitLabels } from '../../units.js';
import { setHTML } from '../html.js';

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
  const intake = calculateHourlyIntake(items, stats.totalDist, avgSpeed, getStatePacing(state));

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

  // 1a. Pacing model toggle & modelled speed readout
  const pacing = getStatePacing(state);
  document.querySelectorAll('#fuel-pacing-pill-group .pill-opt').forEach(p => {
    p.classList.toggle('active', p.dataset.pacing === pacing.mode);
  });
  const pacingHint = document.getElementById('fuel-pacing-hint');
  if (pacingHint) {
    if (pacing.mode === 'terrain' && stats.totalDist > 0) {
      const v = g => Math.round(pacing.speedKmhAtGrade(g));
      pacingHint.textContent = `Modelled: flat ${v(0)} · 4% ${v(4)} · 8% ${v(8)} · descents ≤ ${v(-6)} km/h`;
      pacingHint.title = `Steady ~${Math.round(pacing.powerW)} W for an 82 kg rider + bike, calibrated to ${avgSpeed} km/h overall`;
    } else {
      pacingHint.textContent = pacing.mode === 'constant' ? `Constant ${avgSpeed} km/h on every gradient` : '';
      pacingHint.title = '';
    }
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
      setHTML(hourlyHost, '<div class="hourly-empty">Load route to preview hourly pacing</div>');
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
      setHTML(hourlyHost, chartHtml);
    }
  }

  // 2. Render Fueling Item Cards
  if (items.length === 0) {
    if (emptyHint) emptyHint.style.display = 'block';
    setHTML(listEl, '');
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
          <input type="number" class="fuel-dist-input" aria-label="Distance" data-action="edit-dist" data-id="${escapeHtml(item.id)}" value="${distU}" step="0.5" min="0" max="1000" draggable="false">
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
                <input type="number" class="fuel-carbs-input" aria-label="Carbs" data-action="edit-carbs" data-id="${escapeHtml(item.id)}" value="${item.carbsG || 0}" min="0" max="140" step="5" draggable="false">
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

  setHTML(listEl, html);
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
