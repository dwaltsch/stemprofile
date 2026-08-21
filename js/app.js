/**
 * StemProfile Application Controller
 *
 * Coordinates UI state, GPX file ingestion, signal processing, vector SVG rendering,
 * and high-resolution export pipelines.
 *
 * @module app
 */

import { parseGPX } from './parser.js';
import { processTrackSignal, matchWaypointsToTrack } from './signal.js';
import { renderProfileSVG, WAYPOINT_CONFIG, escapeXml } from './renderer.js';
import { exportSVG, exportPNG, copySVG, updatePrintMatrix } from './export.js';
import { copyShareableLink, decompressPayload, serializeStateToHash } from './share.js';

/**
 * @typedef {Object} StickerSettings
 * @property {number} widthMm - Physical sticker width in millimeters
 * @property {number} heightMm - Physical sticker height in millimeters
 * @property {number} radiusMm - Corner radius in millimeters
 * @property {number} smoothingWindow - Moving average smoothing window (odd integer)
 * @property {number} blockSizeM - Spatial block size in meters (0 for smooth continuous)
 * @property {boolean} showBlockPct - Whether to render in-block gradient percentages
 * @property {'metric'|'imperial'} units - Measurement units system
 * @property {'white'|'dark'} theme - Color theme key
 * @property {string} title - Custom header title string
 * @property {boolean} showHeader - Whether to display top telemetry header
 * @property {boolean} showDistanceTicks - Whether to display distance axis grid & ticks
 * @property {boolean} showElevationLabels - Whether to display min/max altitude tags
 * @property {boolean} showClimbs - Whether to render climb summit badges
 * @property {boolean} showWaypoints - Whether to render race waypoint cues
 * @property {boolean} showWaypointLabels - Whether to render text labels next to waypoints
 * @property {boolean} showCutGuidelines - Whether to render dashed border cutting guides
 * @property {number} printCopies - Number of sticker copies per print sheet (1, 2, or 4)
 */

/**
 * Global reactive application state
 */
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
    printCopies: 2,
    customPositions: {}
  }
};

// ============================================================================
// Theme Management (Light Mode Default)
// ============================================================================
/**
 * Initializes and binds theme toggling (Light / Dark Cockpit) with localStorage persistence.
 */
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
      appState.settings.theme = next === 'dark' ? 'dark' : 'white';
      updateUI();
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
      appState.settings.customPositions = {};
      
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

    if (isNewGPX) {
      appState.settings.customPositions = {};
      if (appState.rawWaypoints && appState.rawWaypoints.length > 0) {
        const matched = matchWaypointsToTrack(appState.rawWaypoints, appState.rawCoords, points);
        appState.waypoints = matched;
      }
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
  const buttons = ['btn-share-link', 'btn-copy-svg', 'btn-export-svg', 'btn-export-png', 'btn-print'];
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

/**
 * Highlights or unhighlights a climb segment on both the SVG profile and the sidebar table.
 *
 * @param {string|number} climbId - ID of the climb to highlight
 * @param {boolean} active - Highlight state
 */
function setClimbHighlight(climbId, active) {
  const row = document.querySelector(`#climbs-table-body tr[data-climb-id="${climbId}"]`);
  const svgEl = document.querySelector(`#profile-svg-elem .climb-segment[data-climb-id="${climbId}"]`);

  if (row) {
    if (active) row.classList.add('hover-active');
    else row.classList.remove('hover-active');
  }

  if (svgEl) {
    if (active) {
      svgEl.classList.add('active');
    } else if (!row || !row.classList.contains('active')) {
      svgEl.classList.remove('active');
    }
  }
}

/**
 * Renders the detected climbs breakdown table and binds interactive cross-highlighting.
 */
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
      <tr data-climb-id="${c.id}">
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

  // Bind interactive row events for cross-highlighting (Table -> SVG)
  const rows = host.querySelectorAll('tr[data-climb-id]');
  rows.forEach(row => {
    const climbId = row.dataset.climbId;

    row.addEventListener('mouseenter', () => {
      setClimbHighlight(climbId, true);
    });

    row.addEventListener('mouseleave', () => {
      setClimbHighlight(climbId, false);
    });

    row.addEventListener('click', () => {
      const isAlreadyActive = row.classList.contains('active');
      rows.forEach(r => r.classList.remove('active'));
      document.querySelectorAll('#profile-svg-elem .climb-segment').forEach(el => el.classList.remove('active'));

      if (!isAlreadyActive) {
        row.classList.add('active');
        const svgEl = document.querySelector(`#profile-svg-elem .climb-segment[data-climb-id="${climbId}"]`);
        if (svgEl) svgEl.classList.add('active');
      }
    });
  });
}

/**
 * Binds tooltip mouse tracking and bidirectional cross-highlighting (SVG -> Table).
 */
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

  // Bidirectional hover from SVG climb segments to Table
  const svgClimbs = svg.querySelectorAll('.climb-segment');
  svgClimbs.forEach(seg => {
    const climbId = seg.dataset.climbId;
    seg.addEventListener('mouseenter', () => {
      setClimbHighlight(climbId, true);
    });
    seg.addEventListener('mouseleave', () => {
      setClimbHighlight(climbId, false);
    });
    seg.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = document.querySelector(`#climbs-table-body tr[data-climb-id="${climbId}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        row.click();
      }
    });
  });
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

  // Stage Zoom Controls (Large / Max / 1:1 Actual)
  const zoomBtns = document.querySelectorAll('#stage-zoom-controls .zoom-btn');
  const stickerWrapper = document.getElementById('sticker-container');

  zoomBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      zoomBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const zoom = btn.dataset.zoom;

      if (zoom === 'actual') {
        document.documentElement.style.setProperty('--stage-zoom-w', 'var(--sticker-w)');
        if (stickerWrapper) stickerWrapper.classList.add('zoom-actual');
      } else if (zoom === 'max') {
        document.documentElement.style.setProperty('--stage-zoom-w', '880px');
        if (stickerWrapper) stickerWrapper.classList.remove('zoom-actual');
      } else {
        // Large (Default view: ~720px)
        document.documentElement.style.setProperty('--stage-zoom-w', '720px');
        if (stickerWrapper) stickerWrapper.classList.remove('zoom-actual');
      }
    });
  });

  // Share Link Button (URL Hash for GitHub Pages)
  const btnShareLink = document.getElementById('btn-share-link');
  if (btnShareLink) {
    btnShareLink.addEventListener('click', async () => {
      try {
        const orig = btnShareLink.innerHTML;
        btnShareLink.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Link Copied!`;
        await copyShareableLink(appState);
        setTimeout(() => btnShareLink.innerHTML = orig, 1800);
      } catch (err) {
        alert('Failed to generate share link: ' + err.message);
      }
    });
  }

  // Reset Custom Dragged Labels Button
  const btnResetLabels = document.getElementById('btn-reset-labels');
  if (btnResetLabels) {
    btnResetLabels.addEventListener('click', () => {
      appState.settings.customPositions = {};
      updateUI();
    });
  }

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

  initLabelDragging();

  // Load from URL Hash if provided (e.g. GitHub Pages shared link)
  if (window.location.hash && window.location.hash.length > 5) {
    loadFromUrlHash(window.location.hash);
  } else {
    updateUI();
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash && window.location.hash.length > 5) {
      loadFromUrlHash(window.location.hash);
    }
  });
}

/**
 * Synchronizes all sidebar input controls, sliders, and checkboxes with current settings.
 */
function syncFormControlsFromSettings() {
  const s = appState.settings;
  const wIn = document.getElementById('input-w-mm');
  if (wIn) wIn.value = s.widthMm;
  const hIn = document.getElementById('input-h-mm');
  if (hIn) hIn.value = s.heightMm;

  // Preset pills
  const presetPills = document.querySelectorAll('#preset-pill-group .pill-opt');
  const targetPreset = `${s.widthMm}x${s.heightMm}`;
  let matchedPreset = false;
  presetPills.forEach(p => {
    const isMatch = p.dataset.value === targetPreset;
    p.classList.toggle('active', isMatch);
    if (isMatch) matchedPreset = true;
  });
  if (!matchedPreset) {
    presetPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
  }

  // Radius & copies
  const radIn = document.getElementById('input-radius');
  if (radIn) radIn.value = s.radiusMm;
  const copIn = document.getElementById('input-copies');
  if (copIn) copIn.value = s.printCopies || 2;

  // Smoothing
  const smSlider = document.getElementById('slider-smoothing');
  const smLabel = document.getElementById('label-smoothing');
  if (smSlider) smSlider.value = s.smoothingWindow;
  if (smLabel) smLabel.textContent = `${s.smoothingWindow} pt`;

  // Block size pills
  const blockPills = document.querySelectorAll('#block-size-pill-group .pill-opt');
  const fieldCustomBlock = document.getElementById('field-custom-block');
  const inputCustomBlock = document.getElementById('input-custom-block');
  let matchedBlock = false;
  blockPills.forEach(p => {
    const isMatch = p.dataset.value === String(s.blockSizeM);
    p.classList.toggle('active', isMatch);
    if (isMatch) matchedBlock = true;
  });
  if (!matchedBlock) {
    blockPills.forEach(p => p.classList.toggle('active', p.dataset.value === 'custom'));
    if (fieldCustomBlock) fieldCustomBlock.style.display = 'block';
    if (inputCustomBlock) inputCustomBlock.value = s.blockSizeM;
  } else {
    if (fieldCustomBlock) fieldCustomBlock.style.display = 'none';
  }

  // Theme & Units
  const themeSelect = document.getElementById('select-theme');
  if (themeSelect) themeSelect.value = s.theme;
  const unitsSelect = document.getElementById('select-units');
  if (unitsSelect) unitsSelect.value = s.units;
  const unitLabel = document.getElementById('label-wpt-unit');
  if (unitLabel) unitLabel.textContent = s.units === 'metric' ? 'km' : 'mi';

  // Title
  const titleInput = document.getElementById('input-title');
  if (titleInput) titleInput.value = s.title || '';

  // Checkboxes
  const syncCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = val !== false;
  };
  syncCheck('chk-block-pct', s.showBlockPct);
  syncCheck('chk-climbs', s.showClimbs);
  syncCheck('chk-waypoints', s.showWaypoints);
  syncCheck('chk-wpt-labels', s.showWaypointLabels);
  syncCheck('chk-header', s.showHeader);
  syncCheck('chk-distance', s.showDistanceTicks);
  syncCheck('chk-ele-labels', s.showElevationLabels);
  syncCheck('chk-cut', s.showCutGuidelines);
}

/**
 * Decompresses and loads shared profile state from URL hash payload (GitHub Pages sharing).
 *
 * @param {string} hashStr - Location hash string
 * @returns {Promise<boolean>} True if loaded successfully
 */
async function loadFromUrlHash(hashStr) {
  if (!hashStr || hashStr.length < 5) return false;

  const cleanHash = hashStr.replace(/^#/, '');
  let b64 = cleanHash;
  if (cleanHash.startsWith('stage=')) {
    b64 = cleanHash.slice(6);
  } else if (cleanHash.startsWith('data=')) {
    b64 = cleanHash.slice(5);
  }

  const payload = await decompressPayload(b64);
  if (!payload || !payload.coords || payload.coords.length < 2) {
    return false;
  }

  appState.rawCoords = payload.coords;
  appState.rawWaypoints = [];
  appState.waypoints = payload.waypoints || [];
  if (payload.settings) {
    appState.settings = {
      ...appState.settings,
      ...payload.settings,
      title: payload.title !== undefined ? payload.title : (payload.settings.title || appState.settings.title)
    };
  } else if (payload.title) {
    appState.settings.title = payload.title;
  }

  const dropFilename = document.getElementById('dropzone-filename');
  if (dropFilename) {
    dropFilename.textContent = `${appState.settings.title || 'Shared Route'} (from Link · ${payload.coords.length} pts)`;
  }

  syncFormControlsFromSettings();
  reprocessAndRender(false);
  return true;
}

/**
 * Initializes interactive mouse/pointer drag-and-drop repositioning for climb summit badges and waypoints.
 * Real-time leader lines recalculate dynamically during drag at 60fps.
 */
function initLabelDragging() {
  const svgHost = document.getElementById('svg-host');
  if (!svgHost) return;

  let activeDrag = null;

  svgHost.addEventListener('pointerdown', e => {
    const dragTarget = e.target.closest('.draggable-label');
    if (!dragTarget) return;

    const svg = document.getElementById('profile-svg-elem');
    if (!svg) return;

    e.preventDefault();
    e.stopPropagation();

    const dragType = dragTarget.dataset.dragType;
    const dragId = dragTarget.dataset.dragId;
    const W = appState.settings.widthMm || 110;
    const H = appState.settings.heightMm || 35;

    // Convert mouse screen coordinates to SVG physical millimeter space
    const rect = svg.getBoundingClientRect();
    const pointerSvgX = ((e.clientX - rect.left) / rect.width) * W;
    const pointerSvgY = ((e.clientY - rect.top) / rect.height) * H;

    // Parse current transform="translate(x, y)"
    const transform = dragTarget.getAttribute('transform') || '';
    const match = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
    const initialBadgeX = match ? parseFloat(match[1]) : 0;
    const initialBadgeY = match ? parseFloat(match[2]) : 0;

    const badgeW = parseFloat(dragTarget.dataset.w || 20);
    const badgeH = parseFloat(dragTarget.dataset.h || 3);
    const summitX = parseFloat(dragTarget.dataset.summitX || dragTarget.dataset.apexX || 0);
    const summitY = parseFloat(dragTarget.dataset.summitY || dragTarget.dataset.apexY || 0);
    const leaderLine = document.getElementById(`leader-${dragId}`);

    try {
      dragTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    dragTarget.classList.add('dragging');
    document.body.classList.add('is-dragging-label');

    activeDrag = {
      pointerId: e.pointerId,
      element: dragTarget,
      dragId,
      dragType,
      dragOffsetX: pointerSvgX - initialBadgeX,
      dragOffsetY: pointerSvgY - initialBadgeY,
      initialBadgeX,
      initialBadgeY,
      badgeW,
      badgeH,
      summitX,
      summitY,
      leaderLine,
      W,
      H,
      hasMoved: false,
      currentX: initialBadgeX,
      currentY: initialBadgeY
    };
  });

  window.addEventListener('pointermove', e => {
    if (!activeDrag) return;

    const svg = document.getElementById('profile-svg-elem');
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const currPointerX = ((e.clientX - rect.left) / rect.width) * activeDrag.W;
    const currPointerY = ((e.clientY - rect.top) / rect.height) * activeDrag.H;

    const rawX = currPointerX - activeDrag.dragOffsetX;
    const rawY = currPointerY - activeDrag.dragOffsetY;

    if (Math.abs(rawX - activeDrag.initialBadgeX) > 0.3 || Math.abs(rawY - activeDrag.initialBadgeY) > 0.3) {
      activeDrag.hasMoved = true;
    }

    const padLeft = 7.5;
    const padRight = 5.0;
    const minX = activeDrag.dragType === 'climb' ? padLeft : 2.0;
    const maxX = activeDrag.dragType === 'climb' ? activeDrag.W - padRight - activeDrag.badgeW : activeDrag.W - 2.0;
    const minY = 1.8;
    const maxY = activeDrag.H - 3.2;

    const newX = Math.max(minX, Math.min(maxX, rawX));
    const newY = Math.max(minY, Math.min(maxY, rawY));

    activeDrag.currentX = newX;
    activeDrag.currentY = newY;

    // Direct DOM translation update for instant 60fps rendering
    activeDrag.element.setAttribute('transform', `translate(${newX.toFixed(2)}, ${newY.toFixed(2)})`);

    // Dynamically recalculate and stretch leader line
    if (activeDrag.leaderLine) {
      if (activeDrag.dragType === 'climb') {
        const badgeCenterX = newX + (activeDrag.badgeW / 2);
        const badgeBottomY = newY + activeDrag.badgeH;
        const badgeTopY = newY;

        let connX = badgeCenterX;
        let connY = badgeBottomY;
        if (badgeBottomY <= activeDrag.summitY - 0.6) {
          connX = badgeCenterX;
          connY = badgeBottomY;
        } else if (badgeTopY >= activeDrag.summitY + 0.6) {
          connX = badgeCenterX;
          connY = badgeTopY;
        } else if (badgeCenterX <= activeDrag.summitX) {
          connX = newX + activeDrag.badgeW;
          connY = newY + (activeDrag.badgeH / 2);
        } else {
          connX = newX;
          connY = newY + (activeDrag.badgeH / 2);
        }

        const dist = Math.hypot(connX - activeDrag.summitX, connY - activeDrag.summitY);
        activeDrag.leaderLine.setAttribute('x1', connX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y1', connY.toFixed(2));
        activeDrag.leaderLine.setAttribute('x2', activeDrag.summitX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y2', activeDrag.summitY.toFixed(2));
        activeDrag.leaderLine.setAttribute('opacity', dist > 1.8 ? '0.85' : '0');
      } else {
        // Waypoint leader pin line
        activeDrag.leaderLine.setAttribute('x1', newX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y1', (newY + 2.0).toFixed(2));
        activeDrag.leaderLine.setAttribute('x2', activeDrag.summitX.toFixed(2));
        activeDrag.leaderLine.setAttribute('y2', activeDrag.summitY.toFixed(2));
      }
    }
  });

  const endDrag = e => {
    if (!activeDrag) return;

    activeDrag.element.classList.remove('dragging');
    document.body.classList.remove('is-dragging-label');

    try {
      activeDrag.element.releasePointerCapture(activeDrag.pointerId);
    } catch (_) {}

    if (activeDrag.hasMoved && activeDrag.currentX !== undefined) {
      if (!appState.settings.customPositions) {
        appState.settings.customPositions = {};
      }
      appState.settings.customPositions[activeDrag.dragId] = {
        x: parseFloat(activeDrag.currentX.toFixed(2)),
        y: parseFloat(activeDrag.currentY.toFixed(2))
      };
      updateUI();
    }

    activeDrag = null;
  };

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

window.addEventListener('DOMContentLoaded', initApp);

