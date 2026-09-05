import '@testing-library/jest-dom/vitest';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = NoopResizeObserver as typeof ResizeObserver;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Radix pointer APIs jsdom lacks.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// Layout APIs CodeMirror measures with; jsdom has no layout so they return empty boxes.
const emptyRect = (): DOMRect => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  toJSON: () => ({}),
});
const emptyRectList = (): DOMRectList => {
  const list = [] as unknown as DOMRectList & { item: (i: number) => DOMRect | null };
  list.item = () => null;
  return list;
};
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRectList;
if (!Element.prototype.getClientRects) Element.prototype.getClientRects = emptyRectList;
if (!document.createRange) {
  document.createRange = () => {
    const range = new Range();
    range.setStart(document.body, 0);
    range.setEnd(document.body, 0);
    return range;
  };
}
