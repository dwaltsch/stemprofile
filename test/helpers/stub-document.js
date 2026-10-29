/**
 * Minimal stub `document` / `window` for exercising UI modules in Node.
 *
 * Every element lookup returns a recording stub element, so UI code paths run
 * end-to-end and surface ReferenceErrors / TypeErrors without a real DOM.
 */

function createStubElement(id = '') {
  const listeners = {};
  const classes = new Set();
  const attrs = {};
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    dataset: {},
    style: { setProperty() {}, display: '' },
    listeners,
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      toggle: (c, on) => ((on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c)),
      contains: c => classes.has(c)
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    appendChild() {},
    focus() {},
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
  };
}

/**
 * Installs stub globals and returns { elements, dispatchWindow, restore }.
 * `elements` maps element id -> stub so tests can assert on rendered output.
 */
export function installStubDocument() {
  const prev = { document: globalThis.document, window: globalThis.window, raf: globalThis.requestAnimationFrame };
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, createStubElement(id));
    return elements.get(id);
  };

  globalThis.document = {
    getElementById: byId,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => createStubElement(),
    documentElement: { style: { setProperty() {} } },
    body: createStubElement('body')
  };
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
  const windowListeners = {};
  globalThis.window = {
    innerWidth: 1280,
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); }
  };

  return {
    elements,
    /** Dispatches a synthetic event object to window listeners of `type`. */
    dispatchWindow(type, event) {
      for (const fn of windowListeners[type] || []) fn(event);
    },
    restore() {
      if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
      if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
      if (prev.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prev.raf;
    }
  };
}
