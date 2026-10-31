/**
 * Interactive Profile Hover & Tooltip UI Module
 *
 * Provides real-time cursor tracking over the vector elevation profile
 * displaying instantaneous distance, elevation, and gradient metrics.
 *
 * @module ui/tooltip
 */

import { getUnitFactors, getUnitLabels } from '../units.js';
import { setClimbHighlight } from './climbs-panel.js';
import { distanceAtClientX } from '../renderer/profile-layers.js';

/**
 * Binds tooltip mouse tracking and bidirectional cross-highlighting (SVG -> Climbs Table).
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function bindTooltipHover(store) {
  const svg = document.getElementById('profile-svg-elem');
  const tip = document.getElementById('cursor-tip');
  const state = store.getState();
  const pts = state.points;

  if (!svg || !tip || !pts || pts.length < 2 || !state.stats) return;

  const { dFactor, eFactor } = getUnitFactors(state.settings.units);
  const { dist: distUnit, ele: eleUnit } = getUnitLabels(state.settings.units);

  svg.onmousemove = function(e) {
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const targetDist = distanceAtClientX(svg, e.clientX, state.stats.totalDist);

    let low = 0, high = pts.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (pts[mid].dist < targetDist) low = mid + 1;
      else high = mid;
    }
    const pt = pts[low];

    tip.style.display = 'block';
    tip.style.left = `${mouseX}px`;
    tip.style.top = `${e.clientY - rect.top}px`;
    tip.textContent = `${(pt.dist * dFactor).toFixed(1)}${distUnit} • ${Math.round(pt.smoothEle * eFactor)}${eleUnit} • ${pt.grade.toFixed(1)}%`;
  };

  svg.onmouseleave = function() {
    tip.style.display = 'none';
  };

  // Bidirectional hover from SVG climb segments to Table
  const svgClimbs = svg.querySelectorAll('.climb-segment');
  svgClimbs.forEach(seg => {
    const climbId = seg.dataset.climbId;
    seg.addEventListener('mouseenter', () => {
      setClimbHighlight(climbId, true);
    });
    seg.addEventListener('mouseleave', () => {
      setClimbHighlight(climbId, false);
    });
    seg.addEventListener('click', e => {
      e.stopPropagation();
      const row = document.querySelector(`#climbs-table-body tr[data-climb-id="${climbId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        row.click();
      }
    });
  });
}
