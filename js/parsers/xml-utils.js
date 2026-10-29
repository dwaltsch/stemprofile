/**
 * Namespace-tolerant XML traversal and value helpers shared by the GPX and TCX parsers.
 *
 * @module parsers/xml-utils
 */

/**
 * Detects whether a string matches an ISO 8601 timestamp or activity date-time code
 * (e.g. "2026-09-03T07:31:52.000Z", "2026-09-03 07:31:52", "2026-09-03_07-31-52").
 *
 * @param {string} str - Candidate string
 * @returns {boolean} True if string matches ISO timestamp format
 */
export function isIsoTimestamp(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return /^\d{4}-\d{2}-\d{2}[T\s_]\d{2}[:\.-]\d{2}([:\.-]\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.test(trimmed);
}

/**
 * Parses raw decimal numbers from coordinate attributes or text content,
 * normalizing comma decimals (e.g. '450,5' -> 450.5).
 *
 * @param {string|number|null|undefined} val - Raw value
 * @returns {number} Parsed float number or NaN
 */
export function parseDecimal(val) {
  if (val === null || val === undefined) return NaN;
  if (typeof val === 'number') return val;
  const str = String(val).trim().replace(',', '.');
  return parseFloat(str);
}

/**
 * Finds all descendant elements matching one or more local tag names (ignoring XML namespaces and case).
 *
 * @param {Document|Element} parent - Parent node
 * @param {string[]} tagNames - Array of local tag names (lowercase)
 * @returns {Element[]} Array of matching elements
 */
export function findElementsByLocalNames(parent, ...tagNames) {
  if (!parent) return [];
  const targetSet = new Set(tagNames.map(t => t.toLowerCase()));
  const matches = [];

  const traverse = (node) => {
    if (!node) return;
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const local = (child.localName || child.tagName || '').replace(/^.*:/, '').toLowerCase();
      if (targetSet.has(local)) {
        matches.push(child);
      }
      traverse(child);
    }
  };

  traverse(parent);
  return matches;
}

/**
 * Finds direct child text content matching a local tag name (ignoring namespace and case).
 *
 * @param {Element} parent - Parent element
 * @param {string} tagName - Local tag name to match
 * @returns {string} Trimmed text content
 */
export function findChildText(parent, tagName) {
  if (!parent) return '';
  const target = tagName.toLowerCase();
  const children = parent.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const local = (child.localName || child.tagName || '').replace(/^.*:/, '').toLowerCase();
    if (local === target) {
      return (child.textContent || '').trim();
    }
  }
  return '';
}

/**
 * Finds text content of the first descendant element matching a local tag name (ignoring namespace and case).
 *
 * @param {Element|Document} parent - Parent node
 * @param {string} tagName - Local tag name to match
 * @returns {string} Trimmed text content
 */
export function getFirstElementText(parent, tagName) {
  const matches = findElementsByLocalNames(parent, tagName);
  return matches.length > 0 ? (matches[0].textContent || '').trim() : '';
}


/**
 * Gets element attribute value case-insensitively.
 *
 * @param {Element} node - DOM element
 * @param {string} name - Attribute name
 * @returns {string|null} Attribute value or null
 */
export function getAttr(node, name) {
  if (!node || typeof node.getAttribute !== 'function') return null;
  const direct = node.getAttribute(name);
  if (direct !== null) return direct;
  return node.getAttribute(name.toLowerCase()) || node.getAttribute(name.toUpperCase());
}

/**
 * Rejects XML documents that declare a DOCTYPE or entities. GPX / TCX exports
 * never need them, and refusing them up front rules out entity-expansion
 * ("billion laughs") and external-entity tricks regardless of browser parser.
 *
 * @param {string} xmlText - Raw XML document text
 * @param {string} format - Format name for the error message (e.g. 'GPX')
 * @throws {Error} When the document contains <!DOCTYPE or <!ENTITY
 */
export function assertNoDoctype(xmlText, format) {
  if (typeof xmlText === 'string' && /<!\s*(DOCTYPE|ENTITY)/i.test(xmlText)) {
    throw new Error(`${format} files with DOCTYPE or ENTITY declarations are not supported.`);
  }
}
