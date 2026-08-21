/**
 * StemProfile App Controller
 * Block-Segmented Pro Elevation Profile Studio
 */

import { parseGPX } from './parser.js';
import { processTrackSignal, matchWaypointsToTrack } from './signal.js';
import { renderProfileSVG, WAYPOINT_CONFIG, escapeXml } from './renderer.js';
import { exportSVG, exportPNG, copySVG, updatePrintMatrix } from './export.js';

const appState = {
  rawCoords: [],
  rawWaypoints: [],
  points: [],
  stats: null,
  climbs: [],
  blocks: [],
  waypoints: [],
  settings: {
    widthMm: 110,
    heightMm: 35,
    radiusMm: 2,
    smoothingWindow: 7,
    blockSizeM: 1000,
    showBlockPct: true,
    units: 'metric',
    theme: 'white',
    title: '',
    showHeader: true,
    showDistanceTicks: true,
    showElevationLabels: true,
    showClimbs: true,
    showWaypoints: true,
    showWaypointLabels: true,
    showCutGuidelines: true,
    printCopies: 2
  }
};

// ============================================================================
// Theme Management (Light Mode Default)
// ============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('stemprofile_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('stemprofile_theme', next);
    });
  }
}

// ============================================================================
// GPX File Handling
// ============================================================================
function handleGPXFile(file) {
  if (!file.name.toLowerCase().endsWith('.gpx')) {
    alert('Please upload a valid .gpx file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const { title, coords, rawWaypoints } = parseGPX(evt.target.result);
      appState.rawCoords = coords;
      appState.rawWaypoints = rawWaypoints || [];
      appState.settings.title = title || file.name.replace(/\.gpx$/i, '');
      
      const titleInput = document.getElementById('input-title');
      if (titleInput) titleInput.value = appState.settings.title;

      const dropFilename = document.getElementById('dropzone-filename');
      if (dropFilename) dropFilename.textContent = `${file.name} (${coords.length} pts)`;

      reprocessAndRender(true);
    } catch (err) {
      alert('Error parsing GPX: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function reprocessAndRender(isNewGPX = false) {
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

    if (isNewGPX && appState.rawWaypoints && appState.rawWaypoints.length > 0) {
      const matched = matchWaypointsToTrack(appState.rawWaypoints, appState.rawCoords, points);
      appState.waypoints = matched;
    }
  }
  updateUI();
  renderClimbsTable();
  renderWaypointsList();
}

function addWaypoint(distM, type = 'feed', label = '') {
  const id = `wpt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const wpt = {
    id,
    distM: Math.max(0, distM),
    type,
    label: label.trim(),
    enabled: true
  };
  appState.waypoints.push(wpt);
  appState.waypoints.sort((a, b) => a.distM - b.distM);
  updateUI();
  renderWaypointsList();
}

function removeWaypoint(id) {
  appState.waypoints = appState.waypoints.filter(w => w.id !== id);
  updateUI();
  renderWaypointsList();
}

function toggleWaypoint(id) {
  const wpt = appState.waypoints.find(w => w.id === id);
  if (wpt) {
    wpt.enabled = !wpt.enabled;
    updateUI();
    renderWaypointsList();
  }
}

function renderWaypointsList() {
  const listEl = document.getElementById('wpt-list');
  const emptyHint = document.getElementById('wpt-empty-hint');
  const countBadge = document.getElementById('wpt-count-badge');
  if (!listEl || !emptyHint || !countBadge) return;

  const wpts = appState.waypoints;
  countBadge.textContent = `${wpts.length}`;

  if (wpts.length === 0) {
    emptyHint.style.display = 'block';
    listEl.innerHTML = '';
    return;
  }

  emptyHint.style.display = 'none';
  const isMetric = appState.settings.units === 'metric';
  const dFactor = isMetric ? 1 / 1000 : 0.000621371;
  const distUnit = isMetric ? 'km' : 'mi';

  let html = '';
  wpts.forEach(w => {
    const typeCfg = WAYPOINT_CONFIG[w.type] || WAYPOINT_CONFIG['feed'];
    const distStr = (w.distM * dFactor).toFixed(1);
    const labelStr = w.label || typeCfg.label;
    const disabledClass = w.enabled === false ? 'disabled' : '';

    html += `
      <div class="wpt-item ${disabledClass}" data-id="${w.id}">
        <div class="wpt-info">
          <div class="wpt-icon-badge" style="background:${typeCfg.color}; color:${typeCfg.textColor};">
            ${getTypeEmoji(w.type)}
          </div>
          <div class="wpt-details">
            <div class="wpt-dist-tag">${distStr} ${distUnit}</div>
            <div class="wpt-label-tag" title="${escapeXml(labelStr)}">${escapeXml(labelStr)}</div>
          </div>
        </div>
        <div class="wpt-actions">
          <button class="wpt-toggle-btn" data-action="toggle" title="${w.enabled ? 'Hide from sticker' : 'Show on sticker'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${w.enabled ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>' : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'}
            </svg>
          </button>
          <button class="wpt-del-btn" data-action="delete" title="Delete waypoint">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

function getTypeEmoji(type) {
  switch (type) {
    case 'water': return '💧';
    case 'food': return '🥪';
    case 'feed': return '🍽️';
    case 'sprint': return '🟢';
    case 'summit': return '⛰️';
    case 'caution': return '⚠️';
    case 'mech': return '🔧';
    case 'checkpoint': return '🏁';
    default: return '📍';
  }
}

function updateUI() {
  const cfg = appState.settings;
  const stats = appState.stats;
  const pts = appState.points;
  const climbs = appState.climbs;
  const blocks = appState.blocks;
  const waypoints = appState.waypoints;
  const hasData = pts.length >= 2 && stats !== null;

  // 1. Render Vector Profile Preview
  const svgHost = document.getElementById('svg-host');
  if (hasData) {
    svgHost.innerHTML = renderProfileSVG(pts, stats, climbs, blocks, waypoints, cfg, false);
  } else {
    svgHost.innerHTML = `
      <div class="empty-msg">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <h3>No GPX Track Loaded</h3>
        <p>Drop GPX track file here or click to browse</p>
      </div>
    `;
  }

  document.documentElement.style.setProperty('--sticker-w', `${cfg.widthMm}mm`);
  document.documentElement.style.setProperty('--sticker-h', `${cfg.heightMm}mm`);

  const stageSizeLabel = document.getElementById('stage-size-label');
  if (stageSizeLabel) stageSizeLabel.textContent = `${cfg.widthMm} × ${cfg.heightMm} mm`;

  // 2. Buttons State
  const buttons = ['btn-copy-svg', 'btn-export-svg', 'btn-export-png', 'btn-print'];
  buttons.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !hasData;
  });

  // 3. Stats Strip & Header Route Status Pill
  const isMetric = cfg.units === 'metric';
  const distU = isMetric ? 'km' : 'mi';
  const eleU = isMetric ? 'm' : 'ft';
  const dFactor = isMetric ? 1 / 1000 : 0.000621371;
  const eFactor = isMetric ? 1 : 3.28084;

  const routeStatusText = document.getElementById('route-status-text');

  if (hasData) {
    const distFormatted = `${(stats.totalDist * dFactor).toFixed(1)} ${distU}`;
    const gainFormatted = `+${Math.round(stats.elevGain * eFactor)} ${eleU}`;
    const maxGradeFormatted = `${stats.maxGrade.toFixed(1)}%`;

    document.getElementById('stat-dist').textContent = distFormatted;
    document.getElementById('stat-gain').textContent = gainFormatted;
    document.getElementById('stat-max-grade').textContent = maxGradeFormatted;
    document.getElementById('stat-climbs').textContent = `${climbs.length}`;

    if (routeStatusText) {
      const title = cfg.title || 'Active Track';
      routeStatusText.textContent = `${title} · ${distFormatted} · ${gainFormatted}`;
    }
  } else {
    document.getElementById('stat-dist').textContent = '--';
    document.getElementById('stat-gain').textContent = '--';
    document.getElementById('stat-max-grade').textContent = '--';
    document.getElementById('stat-climbs').textContent = '--';

    if (routeStatusText) {
      routeStatusText.textContent = 'No track loaded';
    }
  }

  updatePrintMatrix(pts, stats, climbs, blocks, waypoints, cfg);
  bindTooltipHover();
}

function renderClimbsTable() {
  const host = document.getElementById('climbs-table-body');
  const emptyHint = document.getElementById('climbs-empty-hint');
  const countBadge = document.getElementById('climbs-count-badge');
  if (!host) return;

  const climbs = appState.climbs;
  if (countBadge) countBadge.textContent = `${climbs ? climbs.length : 0}`;

  if (!climbs || climbs.length === 0) {
    if (emptyHint) emptyHint.style.display = 'block';
    host.innerHTML = '';
    return;
  }

  if (emptyHint) emptyHint.style.display = 'none';
  let html = '';
  climbs.forEach(c => {
    const catClass = c.category.toLowerCase().replace(/\s+/g, '-');
    html += `
      <tr>
        <td><span class="cat-pill ${catClass}">${c.category}</span></td>
        <td>${c.startKm.toFixed(1)} → ${c.summitKm.toFixed(1)}k</td>
        <td>${c.lengthKm.toFixed(1)}km</td>
        <td style="font-weight:700; color:var(--z2);">${c.avgGrade}%</td>
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
  initTheme();

  // File Input & Drop Target
  const fin = document.getElementById('file-input');
  const previewStage = document.getElementById('preview-stage');
  const svgHost = document.getElementById('svg-host');

  // Prevent default window drop navigation
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    window.addEventListener(ev, e => {
      e.preventDefault();
    }, false);
  });

  function setupDropTarget(el) {
    if (!el) return;
    let dragCounter = 0;

    el.addEventListener('dragenter', e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      el.classList.add('dragover');
    });

    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    el.addEventListener('dragleave', e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        el.classList.remove('dragover');
      }
    });

    el.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      el.classList.remove('dragover');
      const files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length > 0) {
        handleGPXFile(files[0]);
      }
    });
  }

  setupDropTarget(previewStage);

  if (fin) {
    fin.addEventListener('change', e => {
      if (e.target.files.length > 0) handleGPXFile(e.target.files[0]);
    });
  }

  // Clicking SVG: if empty opens file picker; if loaded pre-fills distance for waypoint
  if (svgHost) {
    svgHost.addEventListener('click', e => {
      if (appState.points.length < 2 || !appState.stats) {
        if (fin) fin.click();
        return;
      }
      const svg = document.getElementById('profile-svg-elem');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
      const targetDistM = ratio * appState.stats.totalDist;

      const isMetric = appState.settings.units === 'metric';
      const dFactor = isMetric ? 1 / 1000 : 0.000621371;
      const distVal = (targetDistM * dFactor).toFixed(1);

      const distInput = document.getElementById('input-wpt-dist');
      const labelInput = document.getElementById('input-wpt-label');
      if (distInput) {
        distInput.value = distVal;
        if (labelInput) labelInput.focus();
      }
    });
  }

  // Size Controls & Segmented Pills
  const presetPills = document.querySelectorAll('#preset-pill-group .pill-opt');
  const presetSelect = document.getElementById('preset-size');
  const wIn = document.getElementById('input-w-mm');
  const hIn = document.getElementById('input-h-mm');

  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const val = pill.dataset.value;
      if (presetSelect) presetSelect.value = val;

      if (val !== 'custom') {
        const [w, h] = val.split('x').map(Number);
        appState.settings.widthMm = w;
        appState.settings.heightMm = h;
        if (wIn) wIn.value = w;
        if (hIn) hIn.value = h;
        updateUI();
      }
    });
  });

  if (wIn) {
    wIn.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 20 && v <= 400) {
        appState.settings.widthMm = v;
        presetPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
        if (presetSelect) presetSelect.value = 'custom';
        updateUI();
      }
    });
  }

  if (hIn) {
    hIn.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 10 && v <= 200) {
        appState.settings.heightMm = v;
        presetPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
        if (presetSelect) presetSelect.value = 'custom';
        updateUI();
      }
    });
  }

  const radiusInput = document.getElementById('input-radius');
  if (radiusInput) {
    radiusInput.addEventListener('change', e => {
      appState.settings.radiusMm = parseFloat(e.target.value) || 0;
      updateUI();
    });
  }

  const copiesInput = document.getElementById('input-copies');
  if (copiesInput) {
    copiesInput.addEventListener('change', e => {
      appState.settings.printCopies = parseInt(e.target.value, 10) || 1;
      updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.blocks, appState.waypoints, appState.settings);
    });
  }

  // Segment Block Size & Granularity Pills
  const blockPills = document.querySelectorAll('#block-size-pill-group .pill-opt');
  const blockSelect = document.getElementById('select-block-size');
  const fieldCustomBlock = document.getElementById('field-custom-block');
  const inputCustomBlock = document.getElementById('input-custom-block');

  blockPills.forEach(pill => {
    pill.addEventListener('click', () => {
      blockPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const val = pill.dataset.value;
      if (blockSelect) blockSelect.value = val;

      if (val === 'custom') {
        if (fieldCustomBlock) fieldCustomBlock.style.display = 'block';
        const numVal = parseInt(inputCustomBlock ? inputCustomBlock.value : '1000', 10) || 1000;
        appState.settings.blockSizeM = numVal;
      } else {
        if (fieldCustomBlock) fieldCustomBlock.style.display = 'none';
        const numVal = parseInt(val, 10);
        appState.settings.blockSizeM = numVal;
        if (inputCustomBlock && numVal > 0) inputCustomBlock.value = numVal;
      }
      reprocessAndRender();
    });
  });

  if (inputCustomBlock) {
    inputCustomBlock.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      if (v >= 50 && v <= 50000) {
        appState.settings.blockSizeM = v;
        blockPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
        if (blockSelect) blockSelect.value = 'custom';
        reprocessAndRender();
      }
    });
  }

  // Smoothing
  const smSlider = document.getElementById('slider-smoothing');
  const smLabel = document.getElementById('label-smoothing');
  if (smSlider && smLabel) {
    smSlider.addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      appState.settings.smoothingWindow = v;
      smLabel.textContent = `${v} pt`;
      reprocessAndRender();
    });
  }

  // Theme & Units
  const themeSelect = document.getElementById('select-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', e => {
      appState.settings.theme = e.target.value;
      updateUI();
    });
  }

  const unitsSelect = document.getElementById('select-units');
  if (unitsSelect) {
    unitsSelect.addEventListener('change', e => {
      appState.settings.units = e.target.value;
      const unitLabel = document.getElementById('label-wpt-unit');
      if (unitLabel) unitLabel.textContent = e.target.value === 'metric' ? 'km' : 'mi';
      updateUI();
      renderWaypointsList();
    });
  }

  const titleInput = document.getElementById('input-title');
  if (titleInput) {
    titleInput.addEventListener('input', e => {
      appState.settings.title = e.target.value;
      updateUI();
    });
  }

  // Waypoint Form & Actions
  const btnAddWpt = document.getElementById('btn-add-wpt');
  if (btnAddWpt) {
    btnAddWpt.addEventListener('click', () => {
      if (!appState.stats) {
        alert('Please load a GPX track first.');
        return;
      }
      const distInput = document.getElementById('input-wpt-dist');
      const typeSelect = document.getElementById('select-wpt-type');
      const labelInput = document.getElementById('input-wpt-label');

      const enteredDist = parseFloat(distInput.value);
      if (isNaN(enteredDist) || enteredDist < 0) {
        alert('Please enter a valid distance.');
        distInput.focus();
        return;
      }

      const isMetric = appState.settings.units === 'metric';
      const dFactor = isMetric ? 1 / 1000 : 0.000621371;
      const distM = enteredDist / dFactor;
      const type = typeSelect.value;
      const label = labelInput.value;

      addWaypoint(distM, type, label);
      distInput.value = '';
      labelInput.value = '';
    });
  }

  const wptListEl = document.getElementById('wpt-list');
  if (wptListEl) {
    wptListEl.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const item = btn.closest('.wpt-item');
      if (!item) return;
      const id = item.dataset.id;
      const action = btn.dataset.action;

      if (action === 'delete') {
        removeWaypoint(id);
      } else if (action === 'toggle') {
        toggleWaypoint(id);
      }
    });
  }

  // Checkbox Toggles
  const bindCheck = (id, key) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', e => {
        appState.settings[key] = e.target.checked;
        updateUI();
      });
    }
  };

  bindCheck('chk-block-pct', 'showBlockPct');
  bindCheck('chk-climbs', 'showClimbs');
  bindCheck('chk-waypoints', 'showWaypoints');
  bindCheck('chk-wpt-labels', 'showWaypointLabels');
  bindCheck('chk-header', 'showHeader');
  bindCheck('chk-distance', 'showDistanceTicks');
  bindCheck('chk-ele-labels', 'showElevationLabels');
  bindCheck('chk-cut', 'showCutGuidelines');

  // Exports
  const btnCopy = document.getElementById('btn-copy-svg');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      copySVG(appState.points, appState.stats, appState.climbs, appState.blocks, appState.waypoints, appState.settings, err => {
        if (!err) {
          const orig = btnCopy.innerHTML;
          btnCopy.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
          setTimeout(() => btnCopy.innerHTML = orig, 1400);
        }
      });
    });
  }

  const btnExportSvg = document.getElementById('btn-export-svg');
  if (btnExportSvg) {
    btnExportSvg.addEventListener('click', () => {
      exportSVG(appState.points, appState.stats, appState.climbs, appState.blocks, appState.waypoints, appState.settings);
    });
  }

  const btnExportPng = document.getElementById('btn-export-png');
  if (btnExportPng) {
    btnExportPng.addEventListener('click', () => {
      exportPNG(appState.points, appState.stats, appState.climbs, appState.blocks, appState.waypoints, appState.settings);
    });
  }

  const btnPrint = document.getElementById('btn-print');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.blocks, appState.waypoints, appState.settings);
      window.print();
    });
  }

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      updatePrintMatrix(appState.points, appState.stats, appState.climbs, appState.blocks, appState.waypoints, appState.settings);
    }
  });

  updateUI();
}

window.addEventListener('DOMContentLoaded', initApp);

