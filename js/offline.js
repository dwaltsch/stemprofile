/**
 * Offline & Install Support
 *
 * Registers the service worker (sw.js) that keeps a full copy of the app for
 * offline use, and opens route files the installed app was launched with
 * (manifest file_handlers: "Open with StemProfile" on .gpx / .tcx / .fit).
 *
 * @module offline
 */

import { handleRouteFile } from './ui/dropzone.js';

/**
 * Whether this page can register a service worker: a secure context (https or
 * localhost) in a browser that supports them.
 *
 * @param {Object} [env=globalThis] - Global scope (injectable for tests)
 * @returns {boolean}
 */
export function canUseServiceWorker(env = globalThis) {
  return Boolean(env.navigator && 'serviceWorker' in env.navigator && env.isSecureContext);
}

/**
 * Registers sw.js once the page has loaded, so caching never competes with
 * the first render. Failures only cost offline support and are logged.
 *
 * @param {Object} [env=globalThis] - Global scope (injectable for tests)
 * @returns {boolean} Whether registration was scheduled
 */
export function registerServiceWorker(env = globalThis) {
  if (!canUseServiceWorker(env)) return false;
  const register = () => {
    env.navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Offline support unavailable:', err && err.message);
    });
  };
  if (env.document && env.document.readyState === 'complete') register();
  else env.addEventListener('load', register, { once: true });
  return true;
}

/**
 * Loads the first route file the installed app was opened with.
 *
 * @param {import('./store.js').StemStore} store - Application store
 * @param {Object} [env=globalThis] - Global scope (injectable for tests)
 * @returns {boolean} Whether a launch consumer was installed
 */
export function initFileLaunch(store, env = globalThis) {
  if (!env.launchQueue || typeof env.launchQueue.setConsumer !== 'function') return false;
  env.launchQueue.setConsumer(async params => {
    const handle = params && params.files && params.files[0];
    if (!handle) return;
    try {
      handleRouteFile(await handle.getFile(), store);
    } catch (err) {
      console.warn('Could not open the launched file:', err && err.message);
    }
  });
  return true;
}
