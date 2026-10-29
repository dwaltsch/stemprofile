/**
 * UI Module Smoke Test Suite
 *
 * Runs the workbench, stats strip, actions and mobile tab modules against a
 * stub DOM in both elevation and fueling views, so refactors that drop a local
 * variable or import fail here instead of in the browser.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installStubDocument } from './helpers/stub-document.js';
import { createStore } from '../js/store.js';
import { renderPreview, syncViewMode } from '../js/ui/workbench.js';
import { updateStatsStrip } from '../js/ui/stats-strip.js';
import { initActions, syncHistoryButtons } from '../js/ui/actions.js';
import { setMobileTab, initMobileTabs } from '../js/ui/mobile-tabs.js';

const coords = [];
for (let i = 0; i <= 120; i++) {
  coords.push({ lat: 45 + i * 0.001, lon: 6, ele: 500 + 400 * Math.sin(i / 25) + i });
}

describe('UI Modules: Workbench, Stats Strip, Actions, Mobile Tabs', () => {
  let dom;
  before(() => { dom = installStubDocument(); });
  after(() => dom.restore());

  it('renders the empty state and disables export buttons without a route', () => {
    const store = createStore();
    renderPreview(store.getState());
    updateStatsStrip(store.getState());
    syncViewMode(store.getState());

    assert.ok(dom.elements.get('svg-host').innerHTML.includes('No Route Loaded'));
    assert.equal(dom.elements.get('btn-export-svg').disabled, true);
    assert.equal(dom.elements.get('stat-dist').textContent, '--');
  });

  for (const view of ['elevation', 'fueling']) {
    it(`renders preview, stats and view chrome in ${view} view`, () => {
      const store = createStore();
      store.setTrack({ title: 'Smoke Route', coords });
      store.setActiveView(view);
      const state = store.getState();

      renderPreview(state);
      updateStatsStrip(state);
      syncViewMode(state);

      assert.ok(dom.elements.get('svg-host').innerHTML.includes('<svg'));
      assert.equal(dom.elements.get('btn-export-svg').disabled, false);
      assert.match(dom.elements.get('stat-dist').textContent, /\d+\.\d km/);
      assert.match(dom.elements.get('route-status-text').textContent, /^Smoke Route · /);
      assert.equal(dom.elements.get('btn-view-fueling').classList.contains('active'), view === 'fueling');
      assert.match(dom.elements.get('stage-size-label').textContent, /mm/);
    });
  }

  it('wires actions and mobile tabs, and switching tabs updates the active view', () => {
    const store = createStore();
    store.setTrack({ title: 'Smoke Route', coords });
    initActions(store);
    initMobileTabs(store);

    const shareBtn = dom.elements.get('btn-share-link');
    assert.ok(shareBtn.listeners.click && shareBtn.listeners.click.length > 0, 'share button must be wired');

    setMobileTab(store, 'fueling');
    assert.equal(store.getState().activeView, 'fueling');
  });

  it('syncs undo/redo buttons and handles keyboard shortcuts outside text fields', () => {
    const store = createStore();
    store.setTrack({ title: 'Smoke Route', coords });
    initActions(store);

    syncHistoryButtons(store);
    assert.equal(dom.elements.get('btn-undo').disabled, true);

    store.updateSettings({ theme: 'dark' });
    syncHistoryButtons(store);
    assert.equal(dom.elements.get('btn-undo').disabled, false);

    let prevented = false;
    const key = (k, extra = {}) => ({ key: k, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: { tagName: 'BODY' }, preventDefault() { prevented = true; }, ...extra });

    // Text inputs keep native undo
    dom.dispatchWindow('keydown', key('z', { target: { tagName: 'INPUT', type: 'text' } }));
    assert.equal(store.getState().settings.theme, 'dark');
    assert.equal(prevented, false);

    dom.dispatchWindow('keydown', key('z'));
    assert.equal(store.getState().settings.theme, 'white');
    assert.equal(prevented, true);

    dom.dispatchWindow('keydown', key('z', { shiftKey: true }));
    assert.equal(store.getState().settings.theme, 'dark');
  });
});
