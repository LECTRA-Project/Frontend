import { act } from "@testing-library/react";
import { vi } from "vitest";

/*
  jsdom has no IntersectionObserver. This fake records what is observed; show() then tells
  the observers how much of each page (data-read-page / data-page) is on screen:

    const io = installFakeIntersectionObserver();
    io.show({ 1: 1, 2: 0.6, 3: 0 });              // page → visible fraction
    io.show({ 4: { ratio: 0.3, height: 500 } }, { rootHeight: 800 });  // a tall page

  Call vi.unstubAllGlobals() afterwards.
*/
export function installFakeIntersectionObserver() {
  const observers = new Set();

  class FakeIntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.options = options;
      this.elements = new Set();
      observers.add(this);
    }
    observe(element) {
      this.elements.add(element);
    }
    unobserve(element) {
      this.elements.delete(element);
    }
    disconnect() {
      this.elements.clear();
      observers.delete(this);
    }
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

  function show(pages, { rootHeight = 800 } = {}) {
    act(() => {
      for (const observer of [...observers]) {
        const entries = [];
        for (const element of observer.elements) {
          const page = element.dataset.readPage ?? element.dataset.page;
          if (!(page in pages)) continue;
          const value = pages[page];
          const ratio = typeof value === "number" ? value : value.ratio;
          const height = typeof value === "number" ? ratio * rootHeight : value.height;
          entries.push({
            target: element,
            isIntersecting: ratio > 0,
            intersectionRatio: ratio,
            intersectionRect: { height },
            rootBounds: { height: rootHeight },
          });
        }
        if (entries.length) observer.callback(entries, observer);
      }
    });
  }

  return { observers, show };
}
