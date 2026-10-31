/**
 * File Ingestion & Drag-and-Drop Target UI Module
 *
 * Manages route file ingestion (GPX, TCX, etc.), drag-over visual feedback, and error reporting.
 *
 * @module ui/dropzone
 */

import { parseRouteFile, getSupportedExtensions, isBinaryExtension } from '../parser.js';
import { showToast } from './toast.js';
import { MAX_FILE_BYTES, MAX_TRACK_POINTS, MAX_IMPORTED_WAYPOINTS } from '../limits.js';
import { beginLoad, isLatestLoad } from '../load-guard.js';
import { buildExampleGpx } from '../example-route.js';

/**
 * Loads the built-in example stage through the normal file path.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function loadExampleRoute(store) {
  handleRouteFile(new File([buildExampleGpx()], 'example-alpine-stage.gpx', { type: 'application/gpx+xml' }), store);
}

/**
 * Parses and ingests a route file into the store.
 * Supports text formats (GPX, TCX) and binary formats (e.g. FIT).
 *
 * @param {File} file - User-selected route file
 * @param {import('../store.js').StemStore} store - Application store
 */
export function handleRouteFile(file, store) {
  if (!file) return;

  const supported = getSupportedExtensions();
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();

  if (!supported.includes(ext)) {
    showToast(`Please upload a supported route file (${supported.join(', ')}).`, 'warning');
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    showToast(`File is too large (${Math.round(file.size / 1048576)} MB). Route files up to ${MAX_FILE_BYTES / 1048576} MB are supported.`, 'error');
    return;
  }

  const isBinary = isBinaryExtension(file.name);
  const reader = new FileReader();
  const loadToken = beginLoad();

  reader.onload = function(evt) {
    // A newer file or share link was opened while this one was being read
    if (!isLatestLoad(loadToken)) return;
    try {
      const { title, coords, rawWaypoints } = parseRouteFile(evt.target.result, file.name);
      const stageTitle = title || file.name.replace(/\.[^.]+$/i, '');
      store.setTrack({
        title: stageTitle,
        coords,
        rawWaypoints: rawWaypoints || []
      });
      showToast(`Loaded ${file.name} (${coords.length} points)`, 'success');
      const trimmed = [];
      if (coords.length > MAX_TRACK_POINTS) trimmed.push(`track simplified to ${MAX_TRACK_POINTS.toLocaleString()} points`);
      if ((rawWaypoints || []).length > MAX_IMPORTED_WAYPOINTS) trimmed.push(`only the first ${MAX_IMPORTED_WAYPOINTS} waypoints imported`);
      if (trimmed.length > 0) showToast(`Large file: ${trimmed.join('; ')}.`, 'warning', 4000);
    } catch (err) {
      showToast('Error parsing file: ' + err.message, 'error');
    } finally {
      if (typeof document !== 'undefined') {
        const fin = document.getElementById('file-input');
        if (fin) fin.value = '';
      }
    }
  };

  reader.onerror = function() {
    showToast('Failed to read file from disk.', 'error');
    if (typeof document !== 'undefined') {
      const fin = document.getElementById('file-input');
      if (fin) fin.value = '';
    }
  };

  if (isBinary) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

/**
 * Backward-compatible alias for handleRouteFile.
 */
export const handleGPXFile = handleRouteFile;

let lastPickerOpenTimestamp = 0;

/**
 * Triggers the route file selector with debounce protection against duplicate
 * rapid-fire invocations that cause macOS file dialogs to open and immediately close.
 */
export function openRouteFilePicker() {
  if (typeof document === 'undefined') return;
  const now = Date.now();
  if (now - lastPickerOpenTimestamp < 500) {
    return; // Guard against dual-event triggering
  }
  lastPickerOpenTimestamp = now;

  const fin = document.getElementById('file-input');
  if (fin) {
    fin.value = ''; // Always clear previous selection so re-selecting the same file triggers change reliably
    fin.click();
  }
}

/**
 * Initializes dropzone listeners on the workbench stage and window.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initDropzone(store) {
  const fin = document.getElementById('file-input');
  const previewStage = document.getElementById('preview-stage');

  // Prevent default window drop navigation
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    window.addEventListener(ev, e => {
      e.preventDefault();
    }, false);
  });

  if (previewStage) {
    let dragCounter = 0;

    previewStage.addEventListener('dragenter', e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      previewStage.classList.add('dragover');
    });

    previewStage.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    previewStage.addEventListener('dragleave', e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) {
        previewStage.classList.remove('dragover');
      }
    });

    previewStage.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      previewStage.classList.remove('dragover');
      const files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length > 0) {
        handleRouteFile(files[0], store);
      }
    });
  }

  if (fin) {
    fin.addEventListener('change', e => {
      if (e.target.files && e.target.files.length > 0) {
        const selectedFile = e.target.files[0];
        handleRouteFile(selectedFile, store);
      }
    });
  }
}
