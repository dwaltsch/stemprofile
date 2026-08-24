/**
 * Zero-dependency Minimal DOMParser shim for Node.js
 *
 * Provides the minimal DOMParser interface required by parseGPX()
 * when running tests in Node.js environments without external npm packages.
 */

class MiniNode {
  constructor(tagName, attributes = {}, textContent = '') {
    this.tagName = tagName;
    this.attributes = attributes;
    this.textContent = textContent;
    this.children = [];
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector);
    return results.length > 0 ? results[0] : null;
  }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map(s => s.trim().toLowerCase());
    const matches = [];

    const traverse = (node) => {
      for (const child of node.children) {
        const tag = child.tagName.toLowerCase();
        for (const sel of selectors) {
          if (sel.includes('>')) {
            const parts = sel.split('>').map(p => p.trim());
            if (parts.length === 2 && node.tagName.toLowerCase() === parts[0] && tag === parts[1]) {
              matches.push(child);
            }
          } else if (sel === tag) {
            matches.push(child);
          }
        }
        traverse(child);
      }
    };

    traverse(this);
    return matches;
  }
}

export class MiniDOMParser {
  parseFromString(xmlString, mimeType) {
    const root = new MiniNode('#document');

    // Basic tag tokenizer
    const tagRegex = /<([a-zA-Z0-9_:-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9_:-]+)([^>]*?)\/>/g;
    const attrRegex = /([a-zA-Z0-9_:-]+)=["']([^"']*)["']/g;

    const parseElements = (xml, parentNode) => {
      let match;
      let hasTags = false;
      const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, ''); // strip XML comments

      tagRegex.lastIndex = 0;
      while ((match = tagRegex.exec(cleanXml)) !== null) {
        hasTags = true;
        const tagName = match[1] || match[4];
        const rawAttrs = match[2] || match[5] || '';
        const innerContent = match[3] || '';

        const attrs = {};
        let attrMatch;
        attrRegex.lastIndex = 0;
        while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
          attrs[attrMatch[1]] = attrMatch[2];
        }

        const childNode = new MiniNode(tagName, attrs);
        parentNode.children.push(childNode);

        if (innerContent.trim()) {
          // If inner content has sub-tags, recurse; otherwise store as textContent
          if (/<[a-zA-Z0-9_:-]+/.test(innerContent)) {
            parseElements(innerContent, childNode);
            // Also store stripped textContent
            childNode.textContent = innerContent.replace(/<[^>]+>/g, '').trim();
          } else {
            childNode.textContent = innerContent.trim();
          }
        }
      }

      if (!hasTags && xml.trim()) {
        parentNode.textContent = xml.trim();
      }
    };

    parseElements(xmlString, root);
    return root;
  }
}

// Automatically polyfill globalThis.DOMParser in Node if not already defined
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = MiniDOMParser;
}
