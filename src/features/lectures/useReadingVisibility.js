import { useEffect, useRef } from "react";

/*
  Which pages are on screen, for the reading tracker (readingTracker.js).

  Watches the elements with a `data-read-page="<number>"` attribute inside `rootRef` (the
  viewer's scrolling area) and calls onChange([numbers]) whenever the set of pages that
  are at least half visible changes. A page taller than the viewer can never be half
  visible: it counts when it fills at least half of the viewer instead.

  `key` re-collects the elements when they change (new content); `onChange` null turns it
  off. On unmount (or a new key) it reports [] first. Without IntersectionObserver it does
  nothing; the caller then reports its current page itself (see `supported`).
*/

export const READ_SELECTOR = "[data-read-page]";
const THRESHOLDS = Array.from({ length: 21 }, (_, index) => index / 20);

export const supportsVisibility = () => typeof IntersectionObserver !== "undefined";

export function isHalfVisible(entry) {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= 0.5) return true;
  const rootHeight = entry.rootBounds?.height ?? 0;
  return rootHeight > 0 && entry.intersectionRect.height >= rootHeight / 2;
}

export function useReadingVisibility(rootRef, key, onChange) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  const active = Boolean(onChange);

  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root || !supportsVisibility()) return undefined;
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const page = Number(entry.target.dataset.readPage);
          if (!Number.isInteger(page)) continue;
          const now = isHalfVisible(entry);
          if (now === visible.has(page)) continue;
          if (now) visible.add(page);
          else visible.delete(page);
          changed = true;
        }
        if (changed) callback.current?.([...visible].sort((a, b) => a - b));
      },
      { root, threshold: THRESHOLDS }
    );
    root.querySelectorAll(READ_SELECTOR).forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      callback.current?.([]);
    };
  }, [rootRef, key, active]);
}
