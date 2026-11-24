/**
 * Accessibility: keyboard-movable sticker labels, screen reader names,
 * announced toasts and the print dialog's focus trap.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installStubDocument } from './helpers/stub-document.js';
import { createStore } from '../js/store.js';
import { initDragEngine, enhanceDraggableLabels, labelBounds, KEY_STEP_MM, KEY_STEP_BIG_MM } from '../js/ui/drag-engine.js';
import { showToast } from '../js/ui/toast.js';
import { trapFocus } from '../js/ui/print-modal.js';

const coords = Array.from({ length: 400 }, (_, i) => ({ lat: 45 + i * 0.0005, lon: 6, ele: 300 + 300 * Math.sin(i / 60) }));

/** Stub label element shaped like a rendered draggable badge. */
function label(dragType, dragId, x, y) {
  const attrs = { transform: `translate(${x}, ${y})` };
  let focused = 0;
  const el = {
    dataset: { dragType, dragId, w: '12' },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: k => attrs[k] ?? null,
    closest: sel => (sel === '.draggable-label' ? el : null),
    focus: () => { focused++; },
    attrs,
    get focused() { return focused; }
  };
  return el;
}

describe('A11y: keyboard-movable labels', () => {
  it('arrow keys nudge the focused label, Shift moves further, one undo step per burst', () => {
    const dom = installStubDocument();
    try {
      const store = createStore();
      store.setTrack({ title: 'k', coords });
      const badge = label('wpt', 'wpt-wpt-1', 30, 10);
      const host = document.getElementById('svg-host');
      host.querySelectorAll = () => [badge];
      initDragEngine(store);
      const keydown = host.listeners.keydown[0];
      const press = (key, shiftKey = false) => {
        let prevented = false;
        keydown({ key, shiftKey, target: badge, preventDefault: () => { prevented = true; } });
        const pos = store.getState().settings.customPositions['wpt-wpt-1'];
        if (pos) badge.attrs.transform = `translate(${pos.x}, ${pos.y})`;
        return prevented;
      };

      assert.ok(press('ArrowRight'));
      assert.deepEqual(store.getState().settings.customPositions['wpt-wpt-1'], { x: 30 + KEY_STEP_MM, y: 10 });
      press('ArrowUp', true);
      assert.deepEqual(store.getState().settings.customPositions['wpt-wpt-1'], { x: 30 + KEY_STEP_MM, y: 10 - KEY_STEP_BIG_MM });
      assert.ok(badge.focused >= 2, 'focus returns to the label after the re-render');
      assert.equal(press('Enter'), false, 'other keys are left alone');

      store.undo();
      assert.equal(store.getState().settings.customPositions['wpt-wpt-1'], undefined, 'the burst is one undo step');
    } finally {
      dom.restore();
    }
  });

  it('keeps labels inside the sticker', () => {
    const b = labelBounds('climb', 12, 110, 35);
    assert.deepEqual(b, { minX: 7.5, maxX: 93, minY: 1.8, maxY: 31.8 });
    assert.equal(labelBounds('wpt', 12, 110, 35).maxX, 108);
  });

  it('gives every label a focusable role and a descriptive name', () => {
    const store = createStore();
    store.setTrack({ title: 'k', coords });
    const wpt = store.addWaypoint(5000, 'water', 'Fountain');
    const climb = store.getState().climbs[0];
    assert.ok(climb, 'route has a climb');
    const labels = [label('climb', `climb-${climb.id}`, 10, 5), label('wpt', `wpt-${wpt.id}`, 20, 5)];
    enhanceDraggableLabels({ querySelectorAll: () => labels }, store.getState());
    for (const el of labels) {
      assert.equal(el.attrs.tabindex, '0');
      assert.equal(el.attrs.role, 'button');
      assert.match(el.attrs['aria-label'], /Arrow keys move it/);
    }
    assert.match(labels[0].attrs['aria-label'], new RegExp(`^${climb.category} climb badge, summit at [\\d.]+ km`));
    assert.match(labels[1].attrs['aria-label'], /^Fountain cue at 5\.0 km/);
  });
});

describe('A11y: announcements and dialogs', () => {
  it('toasts live in a polite status region; errors are alerts', () => {
    const dom = installStubDocument();
    try {
      const created = [];
      const origCreate = document.createElement;
      document.createElement = tag => { const el = origCreate(tag); created.push(el); return el; };
      document.getElementById = () => null; // force the container to be created
      showToast('Saved', 'success');
      showToast('Broken', 'error');
      const container = created.find(el => el.id === 'toast-container');
      assert.equal(container.getAttribute('role'), 'status');
      assert.equal(container.getAttribute('aria-live'), 'polite');
      const pills = created.filter(el => (el.className || '').startsWith('toast-pill'));
      assert.equal(pills[0].getAttribute('role'), null);
      assert.equal(pills[1].getAttribute('role'), 'alert');
    } finally {
      dom.restore();
    }
  });

  it('Tab wraps around inside the print dialog', () => {
    const dom = installStubDocument();
    try {
      const mk = name => ({ name, disabled: false, offsetParent: {}, focus() { document.activeElement = this; } });
      const first = mk('first');
      const middle = mk('middle');
      const last = mk('last');
      const dialog = { querySelectorAll: () => [first, middle, last], contains: el => [first, middle, last].includes(el) };
      const tab = shiftKey => { let prevented = false; trapFocus({ key: 'Tab', shiftKey, preventDefault: () => { prevented = true; } }, dialog); return prevented; };

      document.activeElement = last;
      assert.ok(tab(false));
      assert.equal(document.activeElement, first);
      assert.ok(tab(true));
      assert.equal(document.activeElement, last);
      document.activeElement = middle;
      assert.equal(tab(false), false, 'normal Tab inside the dialog is untouched');
      document.activeElement = { name: 'outside' };
      tab(false);
      assert.equal(document.activeElement, first, 'focus outside the dialog is pulled back in');
    } finally {
      dom.restore();
    }
  });
});
