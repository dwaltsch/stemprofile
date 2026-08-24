/**
 * Interactive 60fps Pointer Drag-and-Drop Engine UI Module
 *
 * Enables real-time pointer repositioning for climb summit badges and waypoints
 * with dynamic SVG leader line recalculation.
 *
 * @module ui/drag-engine
 */

import { calculateLeaderLineAnchor } from '../layout.js';

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

    // Parse current transform="translate(x, y)"
    const transform = dragTarget.getAttribute('transform') || '';
    const match = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
    const initialBadgeX = match ? parseFloat(match[1]) : 0;
    const initialBadgeY = match ? parseFloat(match[2]) : 0;

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

    const padLeft = 7.5;
    const padRight = 5.0;
    const minX = activeDrag.dragType === 'climb' ? padLeft : 2.0;
    const maxX = activeDrag.dragType === 'climb' ? activeDrag.W - padRight - activeDrag.badgeW : activeDrag.W - 2.0;
    const minY = 1.8;
    const maxY = activeDrag.H - 3.2;

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

    const endDrag = e => {
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
