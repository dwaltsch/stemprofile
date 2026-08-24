/**
 * Theme Management UI Module
 *
 * Manages light / dark cockpit theme toggling with localStorage persistence.
 *
 * @module ui/theme
 */

/**
 * Initializes theme state and binds header theme toggle button.
 *
 * @param {import('../store.js').StemStore} store - Application store
 */
export function initTheme(store) {
  const savedTheme = localStorage.getItem('stemprofile_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('stemprofile_theme', next);
      store.updateSettings({ theme: next === 'dark' ? 'dark' : 'white' });
    });
  }
}
