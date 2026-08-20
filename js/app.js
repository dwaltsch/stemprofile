/**
 * StemProfile Main Application Controller
 * Pro Race Stem Profile & Climb Segmentation Studio
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
  cues: [],
  settings: {
    widthMm: 110,
    heightMm: 35,
    radiusMm: 2,
    smoothingWindow: 7,
    chunkResolutionM: 250,
    dividerWidth: 0.6,
    units: 'metric',
    theme: 'dark-cockpit',
    title: '',
    showHeader: true,
    showDistanceTicks: true,
    showElevationLabels: true,
    showGradientLegend: true,
    showCutGuidelines: true,
    showClimbs: true,
    showCues: true,
    showGradientDividers: true,
    showBlockPercentages: true,
    printCopies: 2,
    zoomFactor: 1.0
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
      document.getElementById('pts-count-badge').textContent = `${coords.length} pts`;
      document.getElementById('pts-count-badge').style.color = 'var(--z1-color)';

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
      appState.settings.chunkResolutionM
    );
    appState.points = points;
    appState.stats = stats;
    appState.climbs = climbs;
    appState.blocks = blocks;
  }
  updateUI();
  renderClimbsList();
}

function updateUI() {
  const cfg = appState.settings;
  const stats = appState.stats;
  const pts = appState.points;
  const climbs = appState.climbs;
  const cues = appState.cues;
  const blocks = appState.blocks;
  const hasData = pts.length >= 2 && stats !== null;

  // 1. Render SVG Preview
  const svgHost = document.getElementById('svg-host');
  if (hasData) {
    svgHost.innerHTML = renderProfileSVG(pts, stats, climbs, cues, blocks, cfg, false);
  } else {
    svgHost.innerHTML = `
      <div class="empty-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <h3>No GPX Track Loaded</h3>
        <p>Drop a .gpx file to generate your glance-ready pro stem profile</p>
      </div>
    `;
  }

  // 2. Sizing & Zoom
  const container = document.getElementById('sticker-container');
  container.style.transform = `scale(${cfg.zoomFactor})`;
  container.style.transformOrigin = 'center center';

  document.documentElement.style.setProperty('--sticker-width-mm', `${cfg.widthMm}mm`);
  document.documentElement.style.setProperty('--sticker-height-mm', `${cfg.heightMm}mm`);

  document.getElementById('label-aspect').textContent = `Exact Physical Dimensions: ${cfg.widthMm} mm × ${cfg.heightMm} mm (Radius: ${cfg.radiusMm} mm)`;
  document.getElementById('ruler-val').textContent = cfg.widthMm;

  // 3. Action Buttons Disabled / Enabled
  const exportBtns = [
    document.getElementById('btn-copy-svg'),
    document.getElementById('btn-export-svg'),
    document.getElementById('btn-export-png'),
    document.getElementById('btn-print')
  ];
  exportBtns.forEach(btn => {
    if (btn) btn.disabled = !hasData;
  });

  // 4. Metrics & Telemetry
  const isMetric = cfg.units === 'metric';
  const distU = isMetric ? 'km' : 'mi';
  const eleU = isMetric ? 'm' : 'ft';
  const dFactor = isMetric ? 1 / 1000 : 0.000621371;
  const eFactor = isMetric ? 1 : 3.28084;

  if (hasData) {
    document.getElementById('val-tot-dist').textContent = `${(stats.totalDist * dFactor).toFixed(1)} ${distU}`;
    document.getElementById('val-tot-gain').textContent = `+${Math.round(stats.elevGain * eFactor)} ${eleU}`;
    document.getElementById('val-tot-loss').textContent = `-${Math.round(stats.elevLoss * eFactor)} ${eleU} Loss`;
    document.getElementById('val-max-grade').textContent = `${stats.maxGrade.toFixed(1)}%`;
    document.getElementById('val-avg-grade').textContent = `Avg: ${stats.avgGrade.toFixed(1)}%`;
    document.getElementById('val-climbs-count').textContent = `${climbs.length} Climbs`;
    document.getElementById('val-min-max-ele').textContent = `Min: ${Math.round(stats.minEle * eFactor)} / Max: ${Math.round(stats.maxEle * eFactor)} ${eleU}`;

    // Gradient Zone Distribution
    const totalZ = stats.zoneDists.reduce((a, b) => a + b, 0) || 1;
    const pcts = stats.zoneDists.map(v => (v / totalZ) * 100);

    document.getElementById('bar-seg-1').style.width = `${pcts[0].toFixed(1)}%`;
    document.getElementById('bar-seg-2').style.width = `${pcts[1].toFixed(1)}%`;
    document.getElementById('bar-seg-3').style.width = `${pcts[2].toFixed(1)}%`;
    document.getElementById('bar-seg-4').style.width = `${pcts[3].toFixed(1)}%`;

    document.getElementById('z1-dist-txt').textContent = `${(stats.zoneDists[0] * dFactor).toFixed(1)} ${distU}`;
    document.getElementById('z1-pct-txt').textContent = `${pcts[0].toFixed(1)}%`;

    document.getElementById('z2-dist-txt').textContent = `${(stats.zoneDists[1] * dFactor).toFixed(1)} ${distU}`;
    document.getElementById('z2-pct-txt').textContent = `${pcts[1].toFixed(1)}%`;

    document.getElementById('z3-dist-txt').textContent = `${(stats.zoneDists[2] * dFactor).toFixed(1)} ${distU}`;
    document.getElementById('z3-pct-txt').textContent = `${pcts[2].toFixed(1)}%`;

    document.getElementById('z4-dist-txt').textContent = `${(stats.zoneDists[3] * dFactor).toFixed(1)} ${distU}`;
    document.getElementById('z4-pct-txt').textContent = `${pcts[3].toFixed(1)}%`;
  } else {
    document.getElementById('val-tot-dist').textContent = '--';
    document.getElementById('val-tot-gain').textContent = '--';
    document.getElementById('val-tot-loss').textContent = '-- Loss';
    document.getElementById('val-max-grade').textContent = '--';
    document.getElementById('val-avg-grade').textContent = 'Avg: --';
    document.getElementById('val-climbs-count').textContent = '--';
    document.getElementById('val-min-max-ele').textContent = 'Min: -- / Max: --';

    ['bar-seg-1', 'bar-seg-2', 'bar-seg-3', 'bar-seg-4'].forEach(id => {
      document.getElementById(id).style.width = '25%';
    });
    ['z1', 'z2', 'z3', 'z4'].forEach(z => {
      document.getElementById(`${z}-dist-txt`).textContent = '--';
      document.getElementById(`${z}-pct-txt`).textContent = '--%';
    });
  }

  updatePrintMatrix(pts, stats, climbs, cues, blocks, cfg);
  bindTooltipHover();
}

function renderClimbsList() {
  const container = document.getElementById('climbs-list-container');
  if (!container) return;

  const climbs = appState.climbs;
  if (!climbs || climbs.length === 0) {
    container.innerHTML = `<div style="font-size:0.72rem; color:var(--text-dim); padding: 0.5rem 0;">No major climb segments detected (>35m gain, >600m len).</div>`;
    return;
  }

  let html = '';
  climbs.forEach(climb => {
    html += `
      <div class="climb-item-card">
        <div class="climb-item-header">
          <span class="climb-cat-badge ${climb.category.toLowerCase().replace(/\s+/g, '-')}">${climb.category}</span>
          <span class="climb-item-name">KM ${climb.startKm.toFixed(1)} → ${climb.summitKm.toFixed(1)}</span>
          <span class="climb-item-stat">${climb.lengthKm.toFixed(1)} km @ ${climb.avgGrade}%</span>
        </div>
        <div class="climb-item-details">
          <span>Gain: +${climb.gainM}m</span>
          <span>Max: ${climb.maxGrade}%</span>
          <span>Summit: ${climb.summitEle}m</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
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

    document.getElementById('tip-dist').textContent = `${(pt.dist * dFactor).toFixed(2)} ${distU}`;
    document.getElementById('tip-ele').textContent = `${Math.round(pt.smoothEle * eFactor)} ${eleU}`;
    document.getElementById('tip-grade').textContent = `${pt.grade.toFixed(1)}% (Z${pt.zone + 1})`;
  };

  svg.onmouseleave = function() {
    tip.style.display = 'none';
  };
}

export function initApp() {
  // 1. Drag & Drop File Upload
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

  // 2. Presets & Dimensions
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
    updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.cues, appState.blocks, appState.settings);
  });

  // 3. Signal Smoothing & Chunking
  const smSlider = document.getElementById('slider-smoothing');
  const smLabel = document.getElementById('label-smoothing');
  smSlider.addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    appState.settings.smoothingWindow = v;
    smLabel.textContent = `${v}-point`;
    reprocessAndRender();
  });

  document.getElementById('select-chunking').addEventListener('change', e => {
    appState.settings.chunkResolutionM = parseInt(e.target.value, 10) || 250;
    reprocessAndRender();
  });

  document.getElementById('select-units').addEventListener('change', e => {
    appState.settings.units = e.target.value;
    updateUI();
  });

  // 4. Styles & Themes
  document.getElementById('select-theme').addEventListener('change', e => {
    appState.settings.theme = e.target.value;
    updateUI();
  });

  document.getElementById('input-title').addEventListener('input', e => {
    appState.settings.title = e.target.value;
    updateUI();
  });

  // Toggles
  document.getElementById('chk-dividers').addEventListener('change', e => {
    appState.settings.showGradientDividers = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-block-pct').addEventListener('change', e => {
    appState.settings.showBlockPercentages = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-climbs').addEventListener('change', e => {
    appState.settings.showClimbs = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-cues').addEventListener('change', e => {
    appState.settings.showCues = e.target.checked;
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
  document.getElementById('chk-legend').addEventListener('change', e => {
    appState.settings.showGradientLegend = e.target.checked;
    updateUI();
  });
  document.getElementById('chk-cut').addEventListener('change', e => {
    appState.settings.showCutGuidelines = e.target.checked;
    updateUI();
  });

  // Custom Cue Maker
  document.getElementById('btn-add-cue').addEventListener('click', () => {
    const km = parseFloat(document.getElementById('cue-km-input').value);
    const type = document.getElementById('cue-type-select').value;
    const label = document.getElementById('cue-label-input').value.trim() || type;

    if (!isNaN(km) && km >= 0) {
      appState.cues.push({ id: Date.now(), km, type, label });
      document.getElementById('cue-km-input').value = '';
      document.getElementById('cue-label-input').value = '';
      renderCuesList();
      updateUI();
    }
  });

  function renderCuesList() {
    const host = document.getElementById('cues-list-host');
    if (!host) return;
    if (appState.cues.length === 0) {
      host.innerHTML = `<span style="font-size:0.68rem; color:var(--text-dim);">No custom race cues added yet.</span>`;
      return;
    }

    let h = '';
    appState.cues.forEach(c => {
      let icon = '📍';
      if (c.type === 'feed') icon = '🥛';
      else if (c.type === 'sprint') icon = '⚡';
      else if (c.type === 'gravel') icon = '🪨';
      else if (c.type === 'hazard') icon = '⚠️';

      h += `
        <div class="cue-pill">
          <span>${icon} KM ${c.km}: ${c.label}</span>
          <button data-cue-id="${c.id}" class="btn-del-cue" title="Remove cue">×</button>
        </div>
      `;
    });
    host.innerHTML = h;

    host.querySelectorAll('.btn-del-cue').forEach(btn => {
      btn.onclick = function() {
        const id = parseInt(this.getAttribute('data-cue-id'), 10);
        appState.cues = appState.cues.filter(c => c.id !== id);
        renderCuesList();
        updateUI();
      };
    });
  }

  // Zoom
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    appState.settings.zoomFactor = 1.0;
    document.getElementById('btn-zoom-toggle').textContent = 'Zoom 150%';
    updateUI();
  });

  document.getElementById('btn-zoom-toggle').addEventListener('click', () => {
    appState.settings.zoomFactor = (appState.settings.zoomFactor === 1.5) ? 1.0 : 1.5;
    document.getElementById('btn-zoom-toggle').textContent = appState.settings.zoomFactor === 1.5 ? 'Zoom 100%' : 'Zoom 150%';
    updateUI();
  });

  // Export Actions
  document.getElementById('btn-copy-svg').addEventListener('click', () => {
    copySVG(appState.points, appState.stats, appState.climbs, appState.cues, appState.blocks, appState.settings, err => {
      if (!err) {
        const btn = document.getElementById('btn-copy-svg');
        const orig = btn.innerHTML;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.innerHTML = orig, 1400);
      }
    });
  });

  document.getElementById('btn-export-svg').addEventListener('click', () => {
    exportSVG(appState.points, appState.stats, appState.climbs, appState.cues, appState.blocks, appState.settings);
  });

  document.getElementById('btn-export-png').addEventListener('click', () => {
    exportPNG(appState.points, appState.stats, appState.climbs, appState.cues, appState.blocks, appState.settings);
  });

  document.getElementById('btn-print').addEventListener('click', () => {
    updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.cues, appState.blocks, appState.settings);
    window.print();
  });

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.cues, appState.blocks, appState.settings);
    }
  });

  // Initial render (Empty state)
  updateUI();
}

window.addEventListener('DOMContentLoaded', initApp);
