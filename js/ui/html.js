/**
 * HTML Sink Module
 *
 * The only place the app writes raw HTML into the DOM. Every dynamic value in
 * markup passed here must already be escaped with js/escape.js; keeping all
 * writes in one function makes that auditable, and test/robustness.test.js
 * fails if innerHTML / outerHTML / insertAdjacentHTML is written anywhere else.
 *
 * When the browser supports Trusted Types, writes go through a named policy
 * ('stemprofile'), so CSP enforcement (`require-trusted-types-for 'script'`)
 * can be switched on later without touching call sites.
 *
 * @module ui/html
 */

let policy;

function getPolicy() {
  if (policy === undefined) {
    policy = null;
    try {
      if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
        // Pass-through: escaping happens where markup is built (js/escape.js)
        policy = window.trustedTypes.createPolicy('stemprofile', { createHTML: s => s });
      }
    } catch (_) {
      policy = null;
    }
  }
  return policy;
}

/**
 * Replaces an element's content with markup.
 *
 * @param {Element|null} el - Target element (ignored when null)
 * @param {string} html - Markup whose dynamic parts are already escaped
 */
export function setHTML(el, html) {
  if (!el) return;
  const p = getPolicy();
  el.innerHTML = p ? p.createHTML(html) : html;
}
