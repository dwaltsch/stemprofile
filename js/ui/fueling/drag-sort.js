/**
 * Drag-and-drop reordering of fuel item cards (re-times items to the drop position).
 *
 * @module ui/fueling/drag-sort
 */

import { showToast } from '../toast.js';

/**
 * Binds drag-and-drop reordering listeners to the items list via handle.
 *
 * @param {import('../store.js').StemStore} store
 * @param {HTMLElement} listEl
 */
export function bindDragAndDrop(store, listEl) {
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
