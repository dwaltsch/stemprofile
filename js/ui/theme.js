/**
 * Theme Management UI Module
 *
 * Manages light / dark cockpit theme toggling with localStorage persistence.
 *
 * @module ui/theme
 */

let inMemoryTheme = null;

export function getStoredTheme() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      return localStorage.getItem('stemprofile_theme') || inMemoryTheme || 'light';
    }
  } catch (_) {}
  return inMemoryTheme || 'light';
}

export function setStoredTheme(theme) {
  inMemoryTheme = theme;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem('stemprofile_theme', theme);
    }
  } catch (_) {}
}

/**
 * Initializes theme state and binds header theme toggle button.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initTheme(store) {
  const savedTheme = getStoredTheme();
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  const toggleBtn = typeof document !== 'undefined' ? document.getElementById('btn-theme-toggle') : null;
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = (document.documentElement && document.documentElement.getAttribute('data-theme')) || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      if (document.documentElement) {
        document.documentElement.setAttribute('data-theme', next);
      }
      setStoredTheme(next);
      store.updateSettings({ theme: next === 'dark' ? 'dark' : 'white' });
    });
  }
}
