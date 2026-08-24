/**
 * Climbs Table & Interactive Inspector UI Module
 *
 * Renders categorized climbs table, manages bi-directional cross-highlighting
 * with the vector profile, and handles badge visibility toggling.
 *
 * @module ui/climbs-panel
 */

/**
 * Highlights or unhighlights a climb segment on both the SVG profile and sidebar table.
 *
 * @param {string|number} climbId - ID of climb
 * @param {boolean} active - Highlight state
 */
export function setClimbHighlight(climbId, active) {
  const row = document.querySelector(`#climbs-table-body tr[data-climb-id="${climbId}"]`);
  const svgEl = document.querySelector(`#profile-svg-elem .climb-segment[data-climb-id="${climbId}"]`);

  if (row) {
    if (active) row.classList.add('hover-active');
    else row.classList.remove('hover-active');
  }

  if (svgEl) {
    if (active) {
      svgEl.classList.add('active');
    } else if (!row || !row.classList.contains('active')) {
      svgEl.classList.remove('active');
    }
  }
}

/**
 * Renders the detected climbs breakdown table and binds interactive cross-highlighting and badge toggles.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function renderClimbsTable(store) {
  const host = document.getElementById('climbs-table-body');
  const emptyHint = document.getElementById('climbs-empty-hint');
  const countBadge = document.getElementById('climbs-count-badge');
  if (!host) return;

  const state = store.getState();
  const climbs = state.climbs;

  if (countBadge) countBadge.textContent = `${climbs ? climbs.length : 0}`;

  if (!climbs || climbs.length === 0) {
    if (emptyHint) emptyHint.style.display = 'block';
    host.innerHTML = '';
    return;
  }

  if (emptyHint) emptyHint.style.display = 'none';
  const hiddenSet = new Set((state.settings.hiddenClimbIds || []).map(id => String(id)));

  let html = '';
  climbs.forEach(c => {
    const isHidden = hiddenSet.has(String(c.id));
    const catClass = c.category.toLowerCase().replace(/\s+/g, '-');
    const rowClass = isHidden ? 'climb-label-hidden' : '';

    html += `
      <tr data-climb-id="${c.id}" class="${rowClass}">
        <td><span class="cat-pill ${catClass}">${c.category}</span></td>
        <td>${c.startKm.toFixed(1)} → ${c.summitKm.toFixed(1)}k</td>
        <td>${c.lengthKm.toFixed(1)}km</td>
        <td style="font-weight:700; color:var(--z2);">${c.avgGrade}%</td>
        <td>+${c.gainM}m</td>
        <td>${c.summitEle}m</td>
        <td style="text-align:right;">
          <button class="climb-toggle-btn ${isHidden ? 'hidden-badge' : ''}" data-action="toggle-climb" data-climb-id="${c.id}" title="${isHidden ? 'Show climb badge on sticker' : 'Hide climb badge from sticker'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${!isHidden
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
              }
            </svg>
          </button>
        </td>
      </tr>
    `;
  });
  host.innerHTML = html;

  // Bind row events
  const rows = host.querySelectorAll('tr[data-climb-id]');
  rows.forEach(row => {
    const climbId = row.dataset.climbId;

    row.addEventListener('mouseenter', () => {
      setClimbHighlight(climbId, true);
    });

    row.addEventListener('mouseleave', () => {
      setClimbHighlight(climbId, false);
    });

    row.addEventListener('click', e => {
      const toggleBtn = e.target.closest('.climb-toggle-btn');
      if (toggleBtn) {
        e.stopPropagation();
        store.toggleClimbVisibility(climbId);
        return;
      }

      const isAlreadyActive = row.classList.contains('active');
      rows.forEach(r => r.classList.remove('active'));
      document.querySelectorAll('#profile-svg-elem .climb-segment').forEach(el => el.classList.remove('active'));

      if (!isAlreadyActive) {
        row.classList.add('active');
        const svgEl = document.querySelector(`#profile-svg-elem .climb-segment[data-climb-id="${climbId}"]`);
        if (svgEl) svgEl.classList.add('active');
      }
    });
  });
}
