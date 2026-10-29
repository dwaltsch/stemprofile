/**
 * Mobile Tabs UI Module
 *
 * Segmented tab navigation for the single-column mobile workstation layout.
 *
 * @module ui/mobile-tabs
 */

/**
 * Toggles active mobile workstation tab ('preview' | 'design' | 'climbs' | 'fueling').
 *
 * @param {Object} store - Application store
 * @param {'preview'|'design'|'climbs'|'fueling'} tab - Active tab identifier
 */
export function setMobileTab(store, tab) {
  const tabBtns = document.querySelectorAll('.mobile-tab-btn');
  const appLayout = document.getElementById('app-layout') || document.querySelector('.app-layout');
  if (!appLayout) return;

  tabBtns.forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (tab === 'fueling') {
    store.setActiveView('fueling');
  } else if (tab === 'climbs') {
    store.setActiveView('elevation');
  }

  appLayout.setAttribute('data-mobile-tab', tab);
}

/**
 * Initializes listeners for the mobile segmented tab navigation strip.
 *
 * @param {Object} store - Application store
 */
export function initMobileTabs(store) {
  const tabBtns = document.querySelectorAll('.mobile-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) setMobileTab(store, tab);
    });
  });
}
