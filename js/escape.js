/**
 * Markup Escaping Module
 *
 * Single source of truth for escaping untrusted strings (route titles, waypoint
 * labels, fuel item names, shared-link payloads) before interpolating them into
 * HTML or SVG markup.
 *
 * @module escape
 */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes HTML/XML special characters for safe use in text content and quoted attributes.
 * Non-string values are stringified; null and undefined become an empty string.
 *
 * @param {*} value - Raw value
 * @returns {string} Markup-safe string
 */
export function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
}

export { escapeXml as escapeHtml };
