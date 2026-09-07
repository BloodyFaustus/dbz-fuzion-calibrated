function rootElement(root) {
  if (root instanceof HTMLElement) return root;
  return root?.element instanceof HTMLElement ? root.element : null;
}

function scrollContainers(element) {
  if (!element) return [];
  const explicit = Array.from(element.querySelectorAll("[data-scroll-key]"));
  const known = Array.from(element.querySelectorAll(".dbzf-sheet-body, .dbzf-item-body"));
  const root = element.matches?.(".dbzf-sheet-body, .dbzf-item-sheet, .dbzf-item-body") ? [element] : [];
  return [...new Set([...root, ...explicit, ...known])];
}

function stableKey(container, index) {
  return container.dataset.scrollKey || container.getAttribute("name") || `${container.className}:${index}`;
}

export function captureScrollState(root) {
  const element = rootElement(root);
  return scrollContainers(element).map((container, index) => ({
    key: stableKey(container, index),
    top: container.scrollTop,
    left: container.scrollLeft
  }));
}

export function restoreScrollState(root, state = []) {
  const element = rootElement(root);
  if (!element || !Array.isArray(state) || !state.length) return;

  const apply = () => {
    const containers = scrollContainers(element);
    for (const entry of state) {
      const target = containers.find((container, index) => stableKey(container, index) === entry.key);
      if (!target) continue;
      target.scrollTop = entry.top ?? 0;
      target.scrollLeft = entry.left ?? 0;
    }
  };

  requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 50);
  setTimeout(apply, 150);
}

export async function withScrollPreserved(app, callback) {
  const state = captureScrollState(app.element);
  try {
    return await callback();
  } finally {
    app._dbzfLastScrollState = state;
    restoreScrollState(app.element, state);
  }
}

// --- ApplicationV2 part-sync preservation -----------------------------------
// These integrate with _preSyncPartState / _syncPartState so scroll position and
// the focused field (with caret) survive a full re-render synchronously, during
// the DOM swap. That avoids the "jump to top, then snap back" flicker that the
// setTimeout-based restoreScrollState produced.

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

// setSelectionRange only works on these input types; number/checkbox/etc. throw.
function supportsSelection(element) {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return ["text", "search", "url", "tel", "password"].includes(element.type);
}

export function capturePartState(priorElement, state = {}) {
  const element = rootElement(priorElement);
  if (!element) return state;
  state.dbzfScroll = scrollContainers(element).map((container, index) => ({
    key: stableKey(container, index),
    top: container.scrollTop,
    left: container.scrollLeft
  }));
  const active = document.activeElement;
  if (active && active !== document.body && element.contains(active) && active.name) {
    state.dbzfFocus = {
      name: active.name,
      start: supportsSelection(active) ? active.selectionStart : null,
      end: supportsSelection(active) ? active.selectionEnd : null
    };
  }
  return state;
}

export function restorePartState(newElement, state = {}) {
  const element = rootElement(newElement);
  if (!element) return;
  if (Array.isArray(state.dbzfScroll)) {
    const containers = scrollContainers(element);
    for (const entry of state.dbzfScroll) {
      const target = containers.find((container, index) => stableKey(container, index) === entry.key);
      if (!target) continue;
      target.scrollTop = entry.top ?? 0;
      target.scrollLeft = entry.left ?? 0;
    }
  }
  const focus = state.dbzfFocus;
  if (focus?.name) {
    const target = element.querySelector(`[name="${cssEscape(focus.name)}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      if (focus.start != null && supportsSelection(target)) {
        try { target.setSelectionRange(focus.start, focus.end); } catch (_err) { /* ignore */ }
      }
    }
  }
}
