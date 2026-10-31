/**
 * Waypoints & Tactical Cues UI Module
 *
 * Manages race waypoints list rendering, cue creation forms, and cue status toggles.
 *
 * @module ui/waypoints-panel
 */

import { WAYPOINT_CONFIG, escapeXml } from '../renderer.js';
import { getUnitFactors, getUnitLabels } from '../units.js';
import { showToast } from './toast.js';
import { setHTML } from './html.js';

/**
 * Returns technical shortcode badge for waypoint type.
 *
 * @param {string} type - Waypoint type
 * @returns {string} Shortcode string
 */
export function getTypeBadge(type) {
  const cfg = WAYPOINT_CONFIG[type] || WAYPOINT_CONFIG['feed'];
  return cfg.shortCode || 'WPT';
}

/**
 * Backward-compatible badge accessor for waypoint type.
 *
 * @param {string} type - Waypoint type
 * @returns {string} Shortcode string
 */
export function getTypeEmoji(type) {
  return getTypeBadge(type);
}

/**
 * Renders the tactical waypoints list.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function renderWaypointsList(store) {
  const listEl = document.getElementById('wpt-list');
  const emptyHint = document.getElementById('wpt-empty-hint');
  const countBadge = document.getElementById('wpt-count-badge');
  if (!listEl || !emptyHint || !countBadge) return;

  const state = store.getState();
  const wpts = state.waypoints || [];
  countBadge.textContent = `${wpts.length}`;

  if (wpts.length === 0) {
    emptyHint.style.display = 'block';
    setHTML(listEl, '');
    return;
  }

  emptyHint.style.display = 'none';
  const { dFactor } = getUnitFactors(state.settings.units);
  const { dist: distUnit } = getUnitLabels(state.settings.units);

  let html = '';
  wpts.forEach(w => {
    const typeCfg = WAYPOINT_CONFIG[w.type] || WAYPOINT_CONFIG['feed'];
    const distStr = (w.distM * dFactor).toFixed(1);
    const labelStr = w.label || typeCfg.label;
    const disabledClass = w.enabled === false ? 'disabled' : '';

    html += `
      <div class="wpt-item ${disabledClass}" data-id="${escapeXml(w.id)}">
        <div class="wpt-info">
          <div class="wpt-icon-badge" style="background:${typeCfg.color}; color:${typeCfg.textColor};">
            ${getTypeEmoji(w.type)}
          </div>
          <div class="wpt-details">
            <div class="wpt-dist-tag">${distStr} ${distUnit}</div>
            <div class="wpt-label-tag" title="${escapeXml(labelStr)}">${escapeXml(labelStr)}</div>
          </div>
        </div>
        <div class="wpt-actions">
          <button class="wpt-toggle-btn" data-action="toggle" title="${w.enabled ? 'Hide from sticker' : 'Show on sticker'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${w.enabled
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
              }
            </svg>
          </button>
          <button class="wpt-del-btn" data-action="delete" title="Delete waypoint">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  });
  setHTML(listEl, html);
}

/**
 * Initializes waypoint form bindings and click actions.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initWaypointsPanel(store) {
  const btnAddWpt = document.getElementById('btn-add-wpt');
  const wptListEl = document.getElementById('wpt-list');

  if (btnAddWpt) {
    btnAddWpt.addEventListener('click', () => {
      const state = store.getState();
      if (!state.stats) {
        showToast('Please load a GPX track first.', 'warning');
        return;
      }

      const distInput = document.getElementById('input-wpt-dist');
      const typeSelect = document.getElementById('select-wpt-type');
      const labelInput = document.getElementById('input-wpt-label');

      const enteredDist = parseFloat(distInput.value);
      if (isNaN(enteredDist) || enteredDist < 0) {
        showToast('Please enter a valid distance.', 'warning');
        distInput.focus();
        return;
      }

      const { dFactor } = getUnitFactors(state.settings.units);
      const distM = enteredDist / dFactor;
      const routeEnd = state.stats.totalDist * dFactor;
      if (enteredDist > routeEnd + 0.05) {
        const { dist: distUnit } = getUnitLabels(state.settings.units);
        showToast(`The route ends at ${routeEnd.toFixed(1)} ${distUnit}.`, 'warning');
        distInput.focus();
        return;
      }
      const type = typeSelect.value;
      const label = labelInput.value;

      store.addWaypoint(distM, type, label);
      distInput.value = '';
      labelInput.value = '';
      showToast('Waypoint pin added', 'success');
    });
  }

  if (wptListEl) {
    wptListEl.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const item = btn.closest('.wpt-item');
      if (!item) return;
      const id = item.dataset.id;
      const action = btn.dataset.action;

      if (action === 'delete') {
        store.removeWaypoint(id);
      } else if (action === 'toggle') {
        store.toggleWaypoint(id);
      }
    });
  }

  renderWaypointsList(store);
}
