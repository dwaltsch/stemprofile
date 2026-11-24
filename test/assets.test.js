/**
 * Asset Stamping Test Suite
 *
 * index.html must carry up-to-date content hashes for every module and
 * stylesheet (cache busting on GitHub Pages), and the CSP must allow exactly
 * the generated import map. Fix failures with `just stamp`
 * (node scripts/stamp-assets.mjs).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampIndexHtml, stampServiceWorker, listModules, listPageAssets, cspHash, STATIC_PRECACHE } from '../scripts/stamp-assets.mjs';
import { canUseServiceWorker, registerServiceWorker, initFileLaunch } from '../js/offline.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('Assets: Version Stamps', () => {
  it('index.html is stamped for the current file contents (run `just stamp` if this fails)', () => {
    assert.ok(stampIndexHtml(html, root) === html, 'index.html asset versions are stale: run `just stamp`');
  });

  it('the import map versions every module under js/', () => {
    const mapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const { imports } = JSON.parse(mapText);
    for (const rel of listModules(root)) {
      assert.match(imports[`./${rel}`] || '', new RegExp(`^\\./${rel.replace(/[.]/g, '\\.')}\\?v=[0-9a-f]{10}$`), `${rel} missing from import map`);
    }
    assert.equal(Object.keys(imports).length, listModules(root).length, 'no stale entries for deleted modules');
  });

  it('the CSP allows exactly the import map by hash', () => {
    const mapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const scriptSrc = html.match(/script-src ([^;"]+)/)[1].trim();
    assert.equal(scriptSrc, `'self' ${cspHash(mapText)}`);
  });

  it('the import map comes before the entry module script', () => {
    assert.ok(html.indexOf('<script type="importmap">') < html.indexOf('<script type="module"'));
  });

  it('stylesheets and the entry script carry content hashes', () => {
    const versioned = html.match(/(?:href|src)="(?:css|js)\/[\w-]+\.(?:css|js)\?v=[0-9a-f]{10}"/g) || [];
    assert.equal(versioned.length, 10, '9 stylesheets + app.js');
  });
});

describe('Assets: Offline Copy (service worker & manifest)', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);

  it('sw.js is stamped for the current page (run `just stamp` if this fails)', () => {
    assert.ok(stampServiceWorker(sw, html, root) === sw, 'sw.js precache is stale: run `just stamp`');
  });

  it('precaches every asset the page loads, and every precached file exists', () => {
    const assets = listPageAssets(html);
    assert.ok(assets.length >= listModules(root).length + 9, 'all modules and stylesheets found');
    for (const url of assets) assert.ok(precache.includes(url), `${url} is not precached`);
    for (const url of precache) {
      const file = url.split('?')[0].replace(/\/$/, '/index.html');
      assert.ok(fs.existsSync(path.join(root, file)), `${url} does not exist`);
    }
    for (const url of STATIC_PRECACHE) assert.ok(precache.includes(url));
  });

  it('sw.js is a valid classic script', () => {
    assert.doesNotThrow(() => new Function(sw));
  });

  it('the manifest is linked, valid and points at real files', () => {
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.ok(manifest.icons.length > 0);
    for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
    const exts = manifest.file_handlers.flatMap(h => Object.values(h.accept).flat());
    assert.deepEqual(exts.sort(), ['.fit', '.gpx', '.tcx']);
  });

  it('the CSP lets the page register its own worker and manifest only', () => {
    assert.match(html, /worker-src 'self'/);
    assert.match(html, /manifest-src 'self'/);
  });

  it('registers ./sw.js after load, only in secure contexts', () => {
    const calls = [];
    const listeners = {};
    const env = {
      isSecureContext: true,
      document: { readyState: 'loading' },
      navigator: { serviceWorker: { register: url => { calls.push(url); return Promise.resolve(); } } },
      addEventListener: (type, fn) => { listeners[type] = fn; }
    };
    assert.equal(registerServiceWorker(env), true);
    assert.deepEqual(calls, [], 'waits for load');
    listeners.load();
    assert.deepEqual(calls, ['./sw.js']);
    assert.equal(canUseServiceWorker({ ...env, isSecureContext: false }), false);
    assert.equal(canUseServiceWorker({ navigator: {} }), false);
  });

  it('opens the file the installed app was launched with', async () => {
    let consumer = null;
    const env = { launchQueue: { setConsumer: fn => { consumer = fn; } } };
    assert.equal(initFileLaunch({}, env), true);
    let opened = false;
    // An unsupported extension is refused by handleRouteFile before any store access
    await consumer({ files: [{ getFile: async () => { opened = true; return { name: 'notes.txt', size: 3 }; } }] });
    assert.ok(opened);
    await consumer({ files: [] });
    assert.equal(initFileLaunch({}, {}), false);
  });
});

describe('Assets: Info Page', () => {
  const infoDir = path.join(root, 'info');
  const info = fs.readFileSync(path.join(infoDir, 'index.html'), 'utf8');

  it('every local link and asset resolves to a real file', () => {
    const refs = [...info.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
      .filter(ref => !/^https?:/.test(ref));
    assert.ok(refs.length > 0);
    for (const ref of refs) {
      const target = path.resolve(infoDir, ref.split('#')[0]);
      assert.ok(fs.existsSync(target), `${ref} does not exist`);
    }
  });

  it('links back to the builder and the builder links to it', () => {
    assert.match(info, /href="\.\.\/"/);
    assert.match(html, /href="info\/"/);
  });

  it('has no scripts, matching its script-free CSP', () => {
    assert.doesNotMatch(info, /<script/);
    assert.match(info, /default-src 'none'/);
  });

  it('the sitemap lists exactly the canonical URL of each page', () => {
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const canonical = page => page.match(/<link rel="canonical" href="([^"]+)"/)[1];
    assert.deepEqual(locs, [canonical(html), canonical(info)]);
  });
});
