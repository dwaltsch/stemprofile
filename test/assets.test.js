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
import { stampIndexHtml, listModules, cspHash } from '../scripts/stamp-assets.mjs';

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
