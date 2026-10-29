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
