/**
 * Error Boundary UI Module
 *
 * Keeps the workbench usable when one part fails: each UI section runs in
 * isolation (a throwing renderer cannot stop the sections after it), and
 * uncaught errors / rejected promises surface as a toast instead of failing
 * silently in the console.
 *
 * @module ui/error-boundary
 */

import { showToast } from './toast.js';

/** Minimum gap between error toasts, so a failure on every render does not flood the screen. */
const TOAST_COOLDOWN_MS = 4000;
let lastToastAt = -Infinity;

/**
 * Reports an error to the console and, rate-limited, to the user.
 *
 * @param {string} where - Section or source the error came from
 * @param {*} err - The error
 */
export function reportError(where, err) {
  console.error(`[${where}]`, err);
  const now = Date.now();
  if (now - lastToastAt < TOAST_COOLDOWN_MS) return;
  lastToastAt = now;
  const message = err && err.message ? err.message : String(err);
  showToast(`Something went wrong (${where}): ${message}`, 'error', 4000);
}

/**
 * Runs one UI section; an exception is reported instead of propagating.
 *
 * @param {string} section - Section name for the report
 * @param {function(): *} fn - Section body
 * @returns {boolean} Whether the section completed
 */
export function runSection(section, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    reportError(section, err);
    return false;
  }
}

/**
 * Installs window-level handlers for uncaught errors and unhandled promise rejections.
 *
 * @param {Window} [target=window]
 */
export function installGlobalErrorHandlers(target = typeof window !== 'undefined' ? window : null) {
  if (!target || typeof target.addEventListener !== 'function') return;
  target.addEventListener('error', e => reportError('uncaught', e.error || e.message));
  target.addEventListener('unhandledrejection', e => reportError('async', e.reason));
}

/** Test hook: resets the toast cooldown. */
export function resetErrorReporting() {
  lastToastAt = -Infinity;
}
