import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "../../i18n/i18n.js";
import { CSS_PX_PER_POINT } from "./pdfDocument.js";
import { pageTileLabel } from "./citedText.js";

/*
  The PDF drawn with pdf.js, like Chrome's PDF viewer:

  PdfPagesView    every page in one scrolling column on a grey background, fitted to the
                  panel's width ("Fit") or at a fixed zoom; pages are drawn sharp (at the
                  screen's pixel ratio) only while near the visible area, with a text layer
                  so text can be selected and copied. Scrolling reports the current page;
                  `scrollRequest` ({ page, seq }) scrolls to a page.
  PdfThumbnails   the sidebar of small page previews; clicking one goes to that page.

  `sizes` are the pages' sizes at scale 1 (PDF points): [{ width, height }], page 1 first.
*/

const PAGE_GAP = 12; // between pages
const PAD = 16; // around the column
const THUMB_WIDTH = 92;

/* Draws page `number` on `canvas` at `scale` (and its text into `textLayer`). Returns a cancel function. */
function drawPage({ lib, doc, number, scale, canvas, textLayer = null }) {
  let cancelled = false;
  let task = null;
  let text = null;
  doc
    .getPage(number)
    .then((page) => {
      const context = canvas?.getContext("2d");
      if (cancelled || !context) return undefined;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      task = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      return task.promise.then(() => {
        if (cancelled || !textLayer) return undefined;
        textLayer.replaceChildren();
        text = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport });
        return text.render();
      });
    })
    .catch(() => {}); // a cancelled render rejects; nothing to show for it
  return () => {
    cancelled = true;
    task?.cancel();
    text?.cancel();
  };
}

/* Tracks which children (with data-page) of `rootRef` are within `margin` of its visible area. */
function useVisiblePages(rootRef, selector, count, margin) {
  // Without IntersectionObserver (old browsers), every page counts as visible.
  const [visible, setVisible] = useState(() =>
    typeof IntersectionObserver === "undefined" ? new Set(Array.from({ length: count }, (_, index) => index + 1)) : new Set()
  );
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) =>
        setVisible((previous) => {
          const next = new Set(previous);
          for (const entry of entries) {
            const number = Number(entry.target.dataset.page);
            if (entry.isIntersecting) next.add(number);
            else next.delete(number);
          }
          return next;
        }),
      { root, rootMargin: `${margin}px 0px` }
    );
    root.querySelectorAll(selector).forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [rootRef, selector, count, margin]);
  return visible;
}

function PdfPage({ lib, doc, number, size, scale, visible, cited }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      // Far from view: free the page's pixels (it is drawn again when it comes back).
      if (canvasRef.current) canvasRef.current.width = 0;
      textRef.current?.replaceChildren();
      return undefined;
    }
    return drawPage({ lib, doc, number, scale, canvas: canvasRef.current, textLayer: textRef.current });
  }, [lib, doc, number, scale, visible]);

  return (
    <div
      className={`pdf-page ${cited ? "pdf-page--cited" : ""}`}
      data-page={number}
      aria-label={t("Page {number}", { number })}
      style={{ width: Math.floor(size.width * scale), height: Math.floor(size.height * scale), "--scale-factor": scale }}
    >
      <canvas ref={canvasRef} className="pdf-page__canvas" aria-hidden="true" />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

export function PdfPagesView({ lib, doc, sizes, zoom, scrollRequest, citedPage, onPageChange, onFitPercent }) {
  const { t } = useI18n();
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(0);
  // Where the reader is: page and how far into it, kept when the zoom or width changes.
  const anchor = useRef({ page: scrollRequest?.page ?? 1, fraction: 0 });
  const reported = useRef(anchor.current.page);
  const frame = useRef(0);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const widest = Math.max(...sizes.map((size) => size.width));
  const fitScale = width > 2 * PAD ? (width - 2 * PAD) / widest : 1;
  const scale = zoom === null ? fitScale : (zoom / 100) * CSS_PX_PER_POINT;

  useEffect(() => {
    onFitPercent?.((fitScale / CSS_PX_PER_POINT) * 100);
  }, [fitScale, onFitPercent]);

  // Each page's top in the scrolling column (matches the padding and gap in the CSS below).
  const tops = useMemo(() => {
    let y = PAD;
    return sizes.map((size) => {
      const top = y;
      y += Math.floor(size.height * scale) + PAGE_GAP;
      return top;
    });
  }, [sizes, scale]);

  const visible = useVisiblePages(scrollRef, ".pdf-page", sizes.length, 1200);

  function scrollToAnchor() {
    const { page, fraction } = anchor.current;
    const element = scrollRef.current;
    if (element && tops[page - 1] !== undefined) {
      element.scrollTop = tops[page - 1] - PAGE_GAP / 2 + fraction * Math.floor(sizes[page - 1].height * scale);
    }
  }

  // New zoom or width: stay on the same place of the same page.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tops already follows sizes and scale
  useLayoutEffect(scrollToAnchor, [scale, tops]);

  // Go to a page asked for by the toolbar or the thumbnails.
  useLayoutEffect(() => {
    if (!scrollRequest) return;
    anchor.current = { page: scrollRequest.page, fraction: 0 };
    reported.current = scrollRequest.page;
    scrollToAnchor();
    // Only a new request scrolls; zoom changes are handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRequest]);

  function handleScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;
      // The current page is the one at a third of the way down the visible area.
      const probe = element.scrollTop + element.clientHeight / 3;
      let page = 1;
      while (page < tops.length && tops[page] <= probe) page += 1;
      const height = Math.floor(sizes[page - 1].height * scale);
      anchor.current = { page, fraction: Math.min(1, Math.max(0, (element.scrollTop + PAGE_GAP / 2 - tops[page - 1]) / height)) };
      if (page !== reported.current) {
        reported.current = page;
        onPageChange(page);
      }
    });
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <div ref={scrollRef} className="viewer__content pdf__scroll" tabIndex={0} aria-label={t("PDF pages")} onScroll={handleScroll}>
      <div className="pdf__column" style={{ padding: PAD, gap: PAGE_GAP }}>
        {sizes.map((size, index) => (
          <PdfPage
            key={index + 1}
            lib={lib}
            doc={doc}
            number={index + 1}
            size={size}
            scale={scale}
            visible={visible.has(index + 1)}
            cited={citedPage === index + 1}
          />
        ))}
      </div>
    </div>
  );
}

function Thumbnail({ lib, doc, number, size, visible, current, cited, citedIn, onSelect }) {
  useI18n(); // re-render in a new interface language
  const canvasRef = useRef(null);
  const drawn = useRef(false);
  const scale = THUMB_WIDTH / size.width;

  useEffect(() => {
    if (!visible || drawn.current) return undefined;
    drawn.current = true; // small and cheap: drawn once, then kept
    return drawPage({ lib, doc, number, scale, canvas: canvasRef.current });
  }, [lib, doc, number, scale, visible]);

  return (
    <li data-page={number}>
      <button
        type="button"
        className={`pdf__thumb ${cited ? "pdf__thumb--cited" : ""}`}
        aria-current={current ? "page" : undefined}
        aria-label={pageTileLabel(number, cited, citedIn)}
        onClick={() => onSelect(number)}
      >
        <span className="pdf__thumb-sheet" style={{ width: THUMB_WIDTH, height: Math.round(size.height * scale) }}>
          <canvas ref={canvasRef} aria-hidden="true" />
        </span>
        <span className="pdf__thumb-number">{number}</span>
      </button>
    </li>
  );
}

export function PdfThumbnails({ lib, doc, sizes, page, citedPage, citedIn = "the answer", onSelect }) {
  const { t } = useI18n();
  const navRef = useRef(null);
  const visible = useVisiblePages(navRef, "li[data-page]", sizes.length, 600);

  // Keep the current page's preview in view.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest" });
  }, [page]);

  return (
    <nav id="pdf-pages" ref={navRef} className="pdf__pages pdf__pages--thumbs" aria-label={t("Pages")}>
      <ol>
        {sizes.map((size, index) => (
          <Thumbnail
            key={index + 1}
            lib={lib}
            doc={doc}
            number={index + 1}
            size={size}
            visible={visible.has(index + 1)}
            current={page === index + 1}
            cited={citedPage === index + 1}
            citedIn={citedIn}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </nav>
  );
}
