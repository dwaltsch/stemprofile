/**
 * File Ingestion & Drag-and-Drop Target UI Module
 *
 * Manages GPX file ingestion, drag-over visual feedback, and error reporting.
 *
 * @module ui/dropzone
 */

import { parseGPX } from '../parser.js';
import { showToast } from './toast.js';

/**
 * Parses and ingests a GPX file into the store.
 *
 * @param {File} file - User-selected GPX file
 * @param {import('../store.js').StemStore} store - Application store
 */
export function handleGPXFile(file, store) {
  if (!file || !file.name.toLowerCase().endsWith('.gpx')) {
    showToast('Please upload a valid .gpx file.', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const { title, coords, rawWaypoints } = parseGPX(evt.target.result);
      const stageTitle = title || file.name.replace(/\.gpx$/i, '');
      store.setTrack({
        title: stageTitle,
        coords,
        rawWaypoints: rawWaypoints || []
      });
      showToast(`Loaded ${file.name} (${coords.length} points)`, 'success');
    } catch (err) {
      showToast('Error parsing GPX: ' + err.message, 'error');
    }
  };
  reader.onerror = function() {
    showToast('Failed to read file from disk.', 'error');
  };
  reader.readAsText(file);
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
        handleGPXFile(files[0], store);
      }
    });
  }

  if (fin) {
    fin.addEventListener('change', e => {
      if (e.target.files && e.target.files.length > 0) {
        handleGPXFile(e.target.files[0], store);
      }
    });
  }
}
