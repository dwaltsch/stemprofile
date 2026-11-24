/**
 * Interactive 60fps Pointer Drag-and-Drop Engine UI Module
 *
 * Enables real-time pointer repositioning for climb summit badges and waypoints
 * with dynamic SVG leader line recalculation, plus keyboard moves: every label
 * is focusable and the arrow keys nudge it (Shift for bigger steps).
 *
 * @module ui/drag-engine
 */

import { calculateLeaderLineAnchor } from '../layout.js';
import { formatDistance } from '../units.js';

/** Keyboard nudge per arrow key press, in sticker millimetres (Shift: KEY_STEP_BIG_MM). */
export const KEY_STEP_MM = 0.5;
export const KEY_STEP_BIG_MM = 2;

/**
 * Allowed box for a label's top-left corner, matching the pointer drag limits.
 *
 * @param {'climb'|'wpt'} dragType
 * @param {number} badgeW - Label width in mm
 * @param {number} W - Sticker width in mm
 * @param {number} H - Sticker height in mm
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export function labelBounds(dragType, badgeW, W, H) {
  const isClimb = dragType === 'climb';
  return {
    minX: isClimb ? 7.5 : 2.0,
    maxX: isClimb ? W - 5.0 - badgeW : W - 2.0,
    minY: 1.8,
    maxY: H - 3.2
  };
}

/** Current translate(x, y) of a label. */
function readTranslate(el) {
  const match = (el.getAttribute('transform') || '').match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
  return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : { x: 0, y: 0 };
}

/**
 * Makes the sticker's draggable labels reachable and describable by keyboard
 * and screen reader. Called after every preview render (the SVG is rebuilt).
 *
 * @param {Element} host - Element holding the rendered profile SVG
 * @param {Object} state - Store state
 */
export function enhanceDraggableLabels(host, state) {
  if (!host) return;
  const units = state.settings && state.settings.units;
  host.querySelectorAll('.draggable-label').forEach(el => {
    const id = el.dataset.dragId || '';
    let what = 'Label';
    if (el.dataset.dragType === 'climb') {
      const climb = (state.climbs || []).find(c => `climb-${c.id}` === id);
      if (climb) what = `${climb.category} climb badge, summit at ${formatDistance(climb.summitKm * 1000, units)}`;
    } else {
      const wpt = (state.waypoints || []).find(w => `wpt-${w.id}` === id);
      if (wpt) what = `${wpt.label || wpt.type} cue at ${formatDistance(wpt.distM, units)}`;
    }
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-roledescription', 'movable label');
    el.setAttribute('aria-label', `${what}. Arrow keys move it.`);
  });
}

/**
 * Initializes pointer drag-and-drop repositioning for sticker badges and cues.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initDragEngine(store) {
  const svgHost = document.getElementById('svg-host');
  if (!svgHost) return;

  let activeDrag = null;

  svgHost.addEventListener('pointerdown', e => {
    const dragTarget = e.target.closest('.draggable-label');
    if (!dragTarget) return;

    const svg = document.getElementById('profile-svg-elem');
    if (!svg) return;

    e.preventDefault();
    e.stopPropagation();

    const dragType = dragTarget.dataset.dragType;
    const dragId = dragTarget.dataset.dragId;
    const settings = store.getState().settings;
    const W = settings.widthMm || 110;
    const H = settings.heightMm || 35;

    // Convert mouse screen coordinates to SVG physical millimeter space
    const rect = svg.getBoundingClientRect();
    const pointerSvgX = ((e.clientX - rect.left) / rect.width) * W;
    const pointerSvgY = ((e.clientY - rect.top) / rect.height) * H;

    const { x: initialBadgeX, y: initialBadgeY } = readTranslate(dragTarget);

    const badgeW = parseFloat(dragTarget.dataset.w || 20);
    const badgeH = parseFloat(dragTarget.dataset.h || 3);
    const summitX = parseFloat(dragTarget.dataset.summitX || dragTarget.dataset.apexX || 0);
    const summitY = parseFloat(dragTarget.dataset.summitY || dragTarget.dataset.apexY || 0);
    const leaderLine = document.getElementById(`leader-${dragId}`);

    try {
      dragTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    dragTarget.classList.add('dragging');
    document.body.classList.add('is-dragging-label');

    activeDrag = {
      pointerId: e.pointerId,
      element: dragTarget,
      dragId,
      dragType,
      dragOffsetX: pointerSvgX - initialBadgeX,
      dragOffsetY: pointerSvgY - initialBadgeY,
      initialBadgeX,
      initialBadgeY,
      badgeW,
      badgeH,
      summitX,
      summitY,
      leaderLine,
      W,
      H,
      hasMoved: false,
      currentX: initialBadgeX,
      currentY: initialBadgeY
    };
  });

  window.addEventListener('pointermove', e => {
    if (!activeDrag) return;

    const svg = document.getElementById('profile-svg-elem');
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const currPointerX = ((e.clientX - rect.left) / rect.width) * activeDrag.W;
    const currPointerY = ((e.clientY - rect.top) / rect.height) * activeDrag.H;

    const rawX = currPointerX - activeDrag.dragOffsetX;
    const rawY = currPointerY - activeDrag.dragOffsetY;

    if (Math.abs(rawX - activeDrag.initialBadgeX) > 0.3 || Math.abs(rawY - activeDrag.initialBadgeY) > 0.3) {
      activeDrag.hasMoved = true;
    }

    const { minX, maxX, minY, maxY } = labelBounds(activeDrag.dragType, activeDrag.badgeW, activeDrag.W, activeDrag.H);

    const newX = Math.max(minX, Math.min(maxX, rawX));
    const newY = Math.max(minY, Math.min(maxY, rawY));

    activeDrag.currentX = newX;
    activeDrag.currentY = newY;

    // Direct DOM translation update for instant 60fps rendering
    activeDrag.element.setAttribute('transform', `translate(${newX.toFixed(2)}, ${newY.toFixed(2)})`);

    // Dynamically recalculate and stretch leader line using unified anchor math
    if (activeDrag.leaderLine) {
      if (activeDrag.dragType === 'climb') {
        const anchor = calculateLeaderLineAnchor(
          { x: newX, y: newY, w: activeDrag.badgeW, h: activeDrag.badgeH },
          { x: activeDrag.summitX, y: activeDrag.summitY }
        );

        activeDrag.leaderLine.setAttribute('x1', anchor.connX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y1', anchor.connY.toFixed(2));
        activeDrag.leaderLine.setAttribute('x2', activeDrag.summitX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y2', activeDrag.summitY.toFixed(2));
        activeDrag.leaderLine.setAttribute('opacity', anchor.isVisible ? '0.85' : '0');
      } else {
        // Waypoint leader pin line
        activeDrag.leaderLine.setAttribute('x1', newX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y1', (newY + 2.0).toFixed(2));
        activeDrag.leaderLine.setAttribute('x2', activeDrag.summitX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y2', activeDrag.summitY.toFixed(2));
      }
    }
  });

  const endDrag = () => {
    if (!activeDrag) return;

    const drag = activeDrag;
    activeDrag = null;

    if (drag.element) {
      drag.element.classList.remove('dragging');
      try {
        if (drag.element.hasPointerCapture && drag.element.hasPointerCapture(drag.pointerId)) {
          drag.element.releasePointerCapture(drag.pointerId);
        } else if (typeof drag.element.releasePointerCapture === 'function') {
          drag.element.releasePointerCapture(drag.pointerId);
        }
      } catch (_) {}
    }

    if (document.body) {
      document.body.classList.remove('is-dragging-label');
    }

    if (drag.hasMoved && drag.currentX !== undefined) {
      store.setCustomPosition(drag.dragId, {
        x: drag.currentX,
        y: drag.currentY
      });
    }
  };

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Keyboard: arrow keys nudge the focused label; edits within a burst merge into one undo step
  svgHost.addEventListener('keydown', e => {
    const STEPS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = STEPS[e.key];
    const target = e.target.closest && e.target.closest('.draggable-label');
    if (!step || !target || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();

    const settings = store.getState().settings;
    const W = settings.widthMm || 110;
    const H = settings.heightMm || 35;
    const size = e.shiftKey ? KEY_STEP_BIG_MM : KEY_STEP_MM;
    const { x, y } = readTranslate(target);
    const b = labelBounds(target.dataset.dragType, parseFloat(target.dataset.w || 20), W, H);
    const dragId = target.dataset.dragId;
    store.setCustomPosition(dragId, {
      x: Math.max(b.minX, Math.min(b.maxX, x + step[0] * size)),
      y: Math.max(b.minY, Math.min(b.maxY, y + step[1] * size))
    }, `kbd:${dragId}`);

    // The preview was re-rendered: put focus back on the same label
    const again = Array.from(svgHost.querySelectorAll('.draggable-label')).find(el => el.dataset.dragId === dragId);
    if (again) again.focus();
  });

  // Quick-dismiss climb badges directly on canvas via double click
  svgHost.addEventListener('dblclick', e => {
    const dragTarget = e.target.closest('.draggable-label');
    if (!dragTarget) return;
    const dragType = dragTarget.dataset.dragType;
    const dragId = dragTarget.dataset.dragId;
    if (dragType === 'climb' && dragId) {
      const climbId = dragId.replace(/^climb-/, '');
      store.toggleClimbVisibility(climbId);
    }
  });
}
