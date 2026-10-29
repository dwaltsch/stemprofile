/**
 * App Bootstrap & UI Integration Test Suite
 *
 * Verifies that:
 * 1. All UI modules evaluate without syntax errors.
 * 2. Route files can be ingested end-to-end via dropzone module into the store.
 * 3. Both Elevation profile and Fueling Decal renderers execute successfully.
 * 4. Active view switching toggles state cleanly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import dom-shim for Node environments
import './helpers/dom-shim.js';

describe('App & UI Modules: Module Evaluation & Bootstrap', () => {
  it('imports app.js and re-exports core store and helpers', async () => {
    const app = await import('../js/app.js');
    assert.ok(app.store, 'app should export store');
    assert.equal(typeof app.updateUI, 'function', 'app should export updateUI');
    assert.equal(typeof app.initApp, 'function', 'app should export initApp');
    assert.equal(typeof app.loadFromUrlHash, 'function', 'app should export loadFromUrlHash');
    assert.equal(typeof app.setMobileTab, 'function', 'app should export setMobileTab');
  });

  it('imports print-modal.js without syntax or evaluation errors', async () => {
    const printModal = await import('../js/ui/print-modal.js');
    assert.equal(typeof printModal.initPrintModal, 'function');
    assert.equal(typeof printModal.openPrintModal, 'function');
    assert.equal(typeof printModal.closePrintModal, 'function');
    assert.equal(typeof printModal.updatePrintModalPreview, 'function');
    assert.equal(typeof printModal.getActivePrintConfig, 'function');
  });

  it('imports fueling-panel.js without syntax or evaluation errors', async () => {
    const fuelingPanel = await import('../js/ui/fueling-panel.js');
    assert.equal(typeof fuelingPanel.initFuelingPanel, 'function');
    assert.equal(typeof fuelingPanel.renderFuelingPanel, 'function');
  });

  it('imports dropzone.js and parser handlers cleanly', async () => {
    const dropzone = await import('../js/ui/dropzone.js');
    assert.equal(typeof dropzone.initDropzone, 'function');
    assert.equal(typeof dropzone.handleRouteFile, 'function');
  });

  it('imports all supporting UI modules cleanly', async () => {
    const theme = await import('../js/ui/theme.js');
    assert.equal(typeof theme.initTheme, 'function');

    const controls = await import('../js/ui/controls.js');
    assert.equal(typeof controls.initControls, 'function');
    assert.equal(typeof controls.syncFormControls, 'function');

    const waypointsPanel = await import('../js/ui/waypoints-panel.js');
    assert.equal(typeof waypointsPanel.initWaypointsPanel, 'function');
    assert.equal(typeof waypointsPanel.renderWaypointsList, 'function');

    const climbsPanel = await import('../js/ui/climbs-panel.js');
    assert.equal(typeof climbsPanel.setClimbHighlight, 'function');
    assert.equal(typeof climbsPanel.renderClimbsTable, 'function');

    const toast = await import('../js/ui/toast.js');
    assert.equal(typeof toast.showToast, 'function');
  });
});

describe('App & UI Integration: Route File Ingestion Flow', () => {
  it('ingests GPX file through handleRouteFile and generates telemetry & fueling plan', async () => {
    const { createStore } = await import('../js/store.js');
    const { handleRouteFile } = await import('../js/ui/dropzone.js');
    const { renderFuelingSVG } = await import('../js/fueling-renderer.js');
    const { renderProfileSVG } = await import('../js/renderer.js');

    const store = createStore();

    // 14km mountain climb sample route with 20 trackpoints
    let trkpts = '';
    for (let i = 0; i <= 20; i++) {
      trkpts += `<trkpt lat="${(42.9 + i * 0.005).toFixed(4)}" lon="${(0.1 + i * 0.005).toFixed(4)}"><ele>${700 + i * 50}</ele></trkpt>\n`;
    }
    const sampleGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="StemProfile Test">
  <trk>
    <name>Col du Tourmalet Test</name>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    // Mock File object
    const fakeFile = {
      name: 'tourmalet.gpx'
    };

    // Custom FileReader mock for this test
    const origFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsText() {
        process.nextTick(() => {
          this.onload({ target: { result: sampleGpx } });
        });
      }
    };

    try {
      await new Promise((resolve) => {
        store.subscribe((state, event) => {
          if (event === 'track:loaded') resolve();
        });
        handleRouteFile(fakeFile, store);
      });

      const state = store.getState();
      assert.equal(state.settings.title, 'Col du Tourmalet Test');
      assert.ok(state.points.length >= 2, 'Should process trackpoints');
      assert.ok(state.stats.totalDist > 0, 'Should compute total distance');
      assert.ok(state.stats.elevGain > 0, 'Should compute elevation gain');

      // Verify default fueling plan was automatically synthesized
      assert.ok(state.fueling.items.length > 0, 'Should generate default fueling cues');

      // Verify profile SVG renders
      const profileSvg = renderProfileSVG(state);
      assert.ok(profileSvg.includes('<svg'), 'Profile SVG should contain <svg tag');
      assert.ok(profileSvg.includes('Col du Tourmalet Test'), 'Profile SVG should include stage title');

      // Verify fueling decal SVG renders
      const fuelingSvg = renderFuelingSVG(state);
      assert.ok(fuelingSvg.includes('<svg'), 'Fueling SVG should contain <svg tag');
      assert.ok(fuelingSvg.includes('fueling-header'), 'Fueling SVG should contain header group');
      assert.ok(fuelingSvg.includes('Col du Tourmalet Test'), 'Fueling SVG should contain title');

      // Verify view mode toggle
      store.setActiveView('fueling');
      assert.equal(store.getState().activeView, 'fueling');
      store.setActiveView('elevation');
      assert.equal(store.getState().activeView, 'elevation');
    } finally {
      globalThis.FileReader = origFileReader;
    }
  });

  it('verifies openRouteFilePicker debounces rapid dual-clicks and clears value on open', async () => {
    const { openRouteFilePicker } = await import('../js/ui/dropzone.js');

    let clickCount = 0;
    const fakeInput = {
      value: 'previous.gpx',
      click() {
        clickCount++;
      }
    };

    const createdDocument = !globalThis.document;
    if (createdDocument) {
      globalThis.document = {};
    }
    const origGetElementById = globalThis.document.getElementById;
    globalThis.document.getElementById = id => id === 'file-input' ? fakeInput : null;

    try {
      openRouteFilePicker();
      assert.equal(clickCount, 1, 'First picker invocation should trigger input click');
      assert.equal(fakeInput.value, '', 'Input value should be cleared on open');

      // Immediate second call should be ignored by debounce guard
      openRouteFilePicker();
      assert.equal(clickCount, 1, 'Immediate second call within 500ms must be suppressed to prevent macOS dialog dismissal');
    } finally {
      // Leave no partial document behind for later suites in the same process
      if (createdDocument) {
        delete globalThis.document;
      } else {
        globalThis.document.getElementById = origGetElementById;
      }
    }
  });
});

describe('App & UI Responsiveness: Viewport Layout & Overflow Prevention', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  // Stylesheets are split per UI area; concatenate them in the order index.html links them.
  const cssHrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)">/g)].map(m => m[1]);
  const css = cssHrefs.map(href => fs.readFileSync(path.resolve(__dirname, '..', href), 'utf8')).join('\n');

  it('links stylesheets that all exist on disk', () => {
    assert.ok(cssHrefs.length > 0, 'index.html must link at least one stylesheet');
  });

  it('guarantees page and body level horizontal overflow is locked', () => {
    assert.match(css, /html\s*\{[^}]*overflow-x:\s*hidden/, 'html must specify overflow-x: hidden');
    assert.match(css, /body\s*\{[^}]*overflow-x:\s*hidden/, 'body must specify overflow-x: hidden');
    assert.match(css, /max-width:\s*100vw/, 'viewport containment must clamp max-width: 100vw');
  });

  it('ensures sidebars have overflow-x hidden to prevent internal scrollbars', () => {
    assert.match(
      css,
      /aside\.sidebar-left,\s*aside\.sidebar-right\s*\{[^}]*overflow-x:\s*hidden/,
      'Sidebars must have overflow-x: hidden'
    );
  });

  it('ensures app-layout center column uses minmax(0, 1fr) to prevent track expansion', () => {
    assert.match(
      css,
      /\.app-layout\s*\{[^}]*grid-template-columns:\s*290px\s+minmax\(0,\s*1fr\)\s+290px/,
      'Main grid must use minmax(0, 1fr) for center track'
    );
  });

  it('verifies Sticker Theme and Units have dedicated fields to avoid horizontal crowding', () => {
    assert.ok(html.includes('for="select-theme"'), 'select-theme label must exist');
    assert.ok(html.includes('for="select-units"'), 'select-units label must exist');
    // Verify they are not trapped together in a cramped 2-column field-grid
    assert.ok(
      !html.includes('<div class="field-grid">\n            <div class="field">\n              <label class="field-label" for="select-theme">'),
      'select-theme and select-units should not be grouped in a side-by-side field-grid'
    );
  });

  it('verifies responsive breakpoints adapt smoothly across screen sizes', () => {
    assert.match(css, /@media\s*\(max-width:\s*1200px\)/, 'Should have 1200px breakpoint');
    assert.match(css, /@media\s*\(max-width:\s*1080px\)/, 'Should have 1080px breakpoint');
    assert.match(css, /@media\s*\(max-width:\s*960px\)/, 'Should have 960px breakpoint for mobile tab view');
  });
});

describe('App & UI Polish: Professional Typography & Zero Emojis', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  it('guarantees index.html contains zero emoji characters', () => {
    const hasEmoji = emojiRegex.test(html);
    assert.equal(hasEmoji, false, 'index.html must not contain tacky emojis');
  });

  it('verifies all theme display names in renderer.js are clean and professional', async () => {
    const { THEMES } = await import('../js/renderer.js');
    for (const [key, theme] of Object.entries(THEMES)) {
      assert.equal(emojiRegex.test(theme.name), false, `Theme ${key} name must not contain emojis`);
    }
  });

  it('verifies getTypeBadge and getTypeEmoji return clean shortcode tags', async () => {
    const { getTypeBadge, getTypeEmoji } = await import('../js/ui/waypoints-panel.js');
    const { WAYPOINT_CONFIG } = await import('../js/renderer.js');

    for (const [type, cfg] of Object.entries(WAYPOINT_CONFIG)) {
      const badge = getTypeBadge(type);
      const compat = getTypeEmoji(type);
      assert.equal(badge, cfg.shortCode, `Badge for ${type} should equal shortCode ${cfg.shortCode}`);
      assert.equal(compat, cfg.shortCode, `getTypeEmoji compatibility alias should return shortCode`);
      assert.equal(emojiRegex.test(badge), false, `Shortcode ${badge} must not contain emojis`);
    }
  });

  it('renders waypoint list with shortcode badges rather than raw emojis', async () => {
    const { createStore } = await import('../js/store.js');
    const { renderWaypointsList } = await import('../js/ui/waypoints-panel.js');

    const fakeListEl = { innerHTML: '', style: {} };
    const fakeEmptyHint = { style: {} };
    const fakeCountBadge = { textContent: '' };

    const origDoc = globalThis.document;
    globalThis.document = {
      ...origDoc,
      getElementById: (id) => {
        if (id === 'wpt-list') return fakeListEl;
        if (id === 'wpt-empty-hint') return fakeEmptyHint;
        if (id === 'wpt-count-badge') return fakeCountBadge;
        return null;
      }
    };

    try {
      const store = createStore();
      store.addWaypoint(12000, 'feed', 'Feed Station 1');
      store.addWaypoint(25000, 'water', 'Water Refill');

      renderWaypointsList(store);

      assert.ok(fakeListEl.innerHTML.includes('FEED'), 'Waypoint badge should display FEED');
      assert.ok(fakeListEl.innerHTML.includes('H2O'), 'Waypoint badge should display H2O');
      assert.equal(emojiRegex.test(fakeListEl.innerHTML), false, 'Rendered waypoints HTML must contain zero emojis');
    } finally {
      globalThis.document = origDoc;
    }
  });
});

