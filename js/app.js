/**
 * StemProfile App Controller
 * Block-Segmented Pro Elevation Profile Studio
 */

import { parseGPX } from './parser.js';
import { processTrackSignal } from './signal.js';
import { renderProfileSVG } from './renderer.js';
import { exportSVG, exportPNG, copySVG, updatePrintMatrix } from './export.js';

const appState = {
  rawCoords: [],
  points: [],
  stats: null,
  climbs: [],
  blocks: [],
  settings: {
    widthMm: 110,
    heightMm: 35,
    radiusMm: 2,
    smoothingWindow: 7,
    blockSizeM: 1000,
    showBlockPct: true,
    units: 'metric',
    theme: 'dark',
    title: '',
    showHeader: true,
    showDistanceTicks: true,
    showElevationLabels: true,
    showClimbs: true,
    showCutGuidelines: true,
    printCopies: 2
  }
};

function handleGPXFile(file) {
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    alert('Please upload a valid .gpx file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const { title, coords } = parseGPX(evt.target.result);
      appState.rawCoords = coords;
      appState.settings.title = title || file.name.replace(/\.gpx$/i, '');
      
      document.getElementById('input-title').value = appState.settings.title;
      document.getElementById('dropzone-filename').textContent = `${file.name} (${coords.length} pts)`;

      reprocessAndRender();
    } catch (err) {
      alert('Error parsing GPX: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function reprocessAndRender() {
  if (appState.rawCoords.length >= 2) {
    const { points, stats, climbs, blocks } = processTrackSignal(
      appState.rawCoords, 
      appState.settings.smoothingWindow,
      appState.settings.blockSizeM
    );
    appState.points = points;
    appState.stats = stats;
    appState.climbs = climbs;
    appState.blocks = blocks;
  }
  updateUI();
  renderClimbsTable();
}

function updateUI() {
  const cfg = appState.settings;
  const stats = appState.stats;
  const pts = appState.points;
  const climbs = appState.climbs;
  const blocks = appState.blocks;
  const hasData = pts.length >= 2 && stats !== null;

  // 1. Render Preview
  const svgHost = document.getElementById('svg-host');
  if (hasData) {
    svgHost.innerHTML = renderProfileSVG(pts, stats, climbs, blocks, cfg, false);
  } else {
    svgHost.innerHTML = `
      <div class="empty-msg">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        <h3>No GPX Loaded</h3>
        <p>Drop a .gpx route on the left sidebar</p>
      </div>
    `;
  }

  document.documentElement.style.setProperty('--sticker-w', `${cfg.widthMm}mm`);
  document.documentElement.style.setProperty('--sticker-h', `${cfg.heightMm}mm`);
  document.getElementById('stage-size-label').textContent = `${cfg.widthMm} × ${cfg.heightMm} mm`;

  // 2. Buttons
  const buttons = ['btn-copy-svg', 'btn-export-svg', 'btn-export-png', 'btn-print'];
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasData;
  });

  // 3. Stats Strip
  const isMetric = cfg.units === 'metric';
  const distU = isMetric ? 'km' : 'mi';
  const eleU = isMetric ? 'm' : 'ft';
  const dFactor = isMetric ? 1 / 1000 : 0.000621371;
  const eFactor = isMetric ? 1 : 3.28084;

  if (hasData) {
    document.getElementById('stat-dist').textContent = `${(stats.totalDist * dFactor).toFixed(1)} ${distU}`;
    document.getElementById('stat-gain').textContent = `+${Math.round(stats.elevGain * eFactor)} ${eleU}`;
    document.getElementById('stat-max-grade').textContent = `${stats.maxGrade.toFixed(1)}%`;
    document.getElementById('stat-climbs').textContent = `${climbs.length}`;
  } else {
    document.getElementById('stat-dist').textContent = '--';
    document.getElementById('stat-gain').textContent = '--';
    document.getElementById('stat-max-grade').textContent = '--';
    document.getElementById('stat-climbs').textContent = '--';
  }

  updatePrintMatrix(pts, stats, climbs, blocks, cfg);
  bindTooltipHover();
}

function renderClimbsTable() {
  const host = document.getElementById('climbs-table-body');
  const box = document.getElementById('climbs-box');
  if (!host || !box) return;

  const climbs = appState.climbs;
  if (!climbs || climbs.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  let html = '';
  climbs.forEach(c => {
    const catClass = c.category.toLowerCase().replace(/\s+/g, '-');
    html += `
      <tr>
        <td><span class="cat-pill ${catClass}">${c.category}</span></td>
        <td>KM ${c.startKm.toFixed(1)} → ${c.summitKm.toFixed(1)}</td>
        <td>${c.lengthKm.toFixed(1)} km</td>
        <td style="font-weight:600; color:var(--z2);">${c.avgGrade}%</td>
        <td>+${c.gainM}m</td>
        <td>${c.summitEle}m</td>
      </tr>
    `;
  });
  host.innerHTML = html;
}

function bindTooltipHover() {
  const svg = document.getElementById('profile-svg-elem');
  const tip = document.getElementById('cursor-tip');
  const pts = appState.points;
  if (!svg || !tip || pts.length < 2) return;

  const isMetric = appState.settings.units === 'metric';
  const distU = isMetric ? 'km' : 'mi';
  const eleU = isMetric ? 'm' : 'ft';
  const dFactor = isMetric ? 1 / 1000 : 0.000621371;
  const eFactor = isMetric ? 1 : 3.28084;

  svg.onmousemove = function(e) {
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
    const targetDist = ratio * appState.stats.totalDist;

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
    tip.textContent = `${(pt.dist * dFactor).toFixed(1)}${distU} • ${Math.round(pt.smoothEle * eFactor)}${eleU} • ${pt.grade.toFixed(1)}%`;
  };

  svg.onmouseleave = function() {
    tip.style.display = 'none';
  };
}

export function initApp() {
  // Dropzone
  const dz = document.getElementById('dropzone');
  const fin = document.getElementById('file-input');

  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover');
  }));

  dz.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleGPXFile(files[0]);
  });
  fin.addEventListener('change', e => {
    if (e.target.files.length > 0) handleGPXFile(e.target.files[0]);
  });

  // Size Controls
  const preset = document.getElementById('preset-size');
  const wIn = document.getElementById('input-w-mm');
  const hIn = document.getElementById('input-h-mm');

  preset.addEventListener('change', e => {
    if (e.target.value !== 'custom') {
      const [w, h] = e.target.value.split('x').map(Number);
      appState.settings.widthMm = w;
      appState.settings.heightMm = h;
      wIn.value = w;
      hIn.value = h;
      updateUI();
    }
  });

  wIn.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    if (v >= 20 && v <= 400) {
      appState.settings.widthMm = v;
      preset.value = 'custom';
      updateUI();
    }
  });

  hIn.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    if (v >= 10 && v <= 200) {
      appState.settings.heightMm = v;
      preset.value = 'custom';
      updateUI();
    }
  });

  document.getElementById('input-radius').addEventListener('change', e => {
    appState.settings.radiusMm = parseFloat(e.target.value) || 0;
    updateUI();
  });

  document.getElementById('input-copies').addEventListener('change', e => {
    appState.settings.printCopies = parseInt(e.target.value, 10) || 1;
    updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.blocks, appState.settings);
  });

  // Segment Block Size
  document.getElementById('select-block-size').addEventListener('change', e => {
    appState.settings.blockSizeM = parseInt(e.target.value, 10);
    reprocessAndRender();
  });

  // Smoothing
  const smSlider = document.getElementById('slider-smoothing');
  const smLabel = document.getElementById('label-smoothing');
  smSlider.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    appState.settings.smoothingWindow = v;
    smLabel.textContent = `${v} pt`;
    reprocessAndRender();
  });

  // Theme & Units
  document.getElementById('select-theme').addEventListener('change', e => {
    appState.settings.theme = e.target.value;
    updateUI();
  });

  document.getElementById('select-units').addEventListener('change', e => {
    appState.settings.units = e.target.value;
    updateUI();
  });

  document.getElementById('input-title').addEventListener('input', e => {
    appState.settings.title = e.target.value;
    updateUI();
  });

  // Checkbox Toggles
  document.getElementById('chk-block-pct').addEventListener('change', e => {
    appState.settings.showBlockPct = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-climbs').addEventListener('change', e => {
    appState.settings.showClimbs = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-header').addEventListener('change', e => {
    appState.settings.showHeader = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-distance').addEventListener('change', e => {
    appState.settings.showDistanceTicks = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-ele-labels').addEventListener('change', e => {
    appState.settings.showElevationLabels = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-cut').addEventListener('change', e => {
    appState.settings.showCutGuidelines = e.target.checked;
    updateUI();
  });

  // Exports
  document.getElementById('btn-copy-svg').addEventListener('click', () => {
    copySVG(appState.points, appState.stats, appState.climbs, appState.blocks, appState.settings, err => {
      if (!err) {
        const btn = document.getElementById('btn-copy-svg');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = orig, 1200);
      }
    });
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    exportSVG(appState.points, appState.stats, appState.climbs, appState.blocks, appState.settings);
  });

  document.getElementById('btn-export-png').addEventListener('click', () => {
    exportPNG(appState.points, appState.stats, appState.climbs, appState.blocks, appState.settings);
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.blocks, appState.settings);
    window.print();
  });

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.blocks, appState.settings);
    }
  });

  updateUI();
}

window.addEventListener('DOMContentLoaded', initApp);
