import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import IconButton from "../../components/ui/IconButton.jsx";
import { formatFileSize } from "../../services/materials/materialTypes.js";
import { canRenderPdf, loadPdfjs } from "./pdfDocument.js";
import { PdfPagesView, PdfThumbnails } from "./PdfPages.jsx";
import { getFitZoomIndex, ZOOM_STEPS } from "./pdfZoom.js";
import { ViewerBanner, ViewerHead, ZoomControls } from "./ViewerChrome.jsx";
import "./files.css";

/*
  Inline PDF viewer — shown in the material viewer beside the chat (not in a popup).

  The PDF is drawn with pdf.js (PdfPages.jsx), like Chrome's PDF viewer: all pages in one
  scrolling column, sharp at any zoom, with selectable text, and a sidebar of page
  previews (thumbnails) to jump to any page. It opens fitted to the panel's width ("Fit");
  zooming steps through fixed zooms (100 % = the page's real size).

  If pdf.js can't open the file (or can't run, as in tests), the browser's own PDF viewer
  shows it in a frame instead, with our page and zoom passed in its URL; the sidebar then
  lists numbered pages.

  Props:
    material    the PDF: { name, url, meta?, size?, pages?, loading?, loadError? }
                Lecture PDFs are fetched from the backend by the workspace; `loading`
                is true meanwhile. `pages` is the page count when known.
    initialPage page to open first (e.g. the page an assistant answer cited)
    cited       true when opened from a source in an answer: the banner says so and the
                page is highlighted until the student moves to another page
    onCollapse  closes the viewer
    widen       { wide, disabled, onToggle } for the Widen / Restore button (optional)

  The toolbar's Pages button shows or hides the sidebar; it starts open when the panel is
  at least PAGES_OPEN_WIDTH wide. First / Last page sit next to Previous / Next.
*/

// The pages sidebar starts open in panels at least this wide.
const PAGES_OPEN_WIDTH = 600;

export default function PdfViewerPanel({ material, initialPage = 1, cited = false, onCollapse, widen = null }) {
  const usePdfjs = canRenderPdf();
  const ready = Boolean(material.url) && !material.loading && !material.loadError;

  // pdf.js document for material.url: { url, lib, doc, sizes } once open, { url, error } if it failed.
  const [opened, setOpened] = useState(null);
  useEffect(() => {
    if (!usePdfjs || !ready) return undefined;
    let cancelled = false;
    let task = null;
    loadPdfjs()
      .then((lib) => {
        if (cancelled) return undefined;
        task = lib.getDocument({ url: material.url });
        return task.promise.then(async (doc) => {
          const sizes = await Promise.all(
            Array.from({ length: doc.numPages }, (_, index) =>
              doc.getPage(index + 1).then((page) => {
                const { width, height } = page.getViewport({ scale: 1 });
                return { width, height };
              })
            )
          );
          if (!cancelled) setOpened({ url: material.url, lib, doc, sizes });
        });
      })
      .catch((error) => {
        if (!cancelled) setOpened({ url: material.url, error });
      });
    return () => {
      cancelled = true;
      task?.destroy(); // also closes the document
    };
  }, [usePdfjs, ready, material.url]);

  const current = opened?.url === material.url ? opened : null;
  const drawn = current?.doc ? current : null; // pdf.js has the document
  const framed = !usePdfjs || Boolean(current?.error); // the browser's viewer shows it instead

  const pageCount = drawn ? drawn.doc.numPages : material.pages ?? null;
  const panelRef = useRef(null);
  const [page, setPage] = useState(() => Math.max(1, Math.min(initialPage, pageCount ?? initialPage)));
  const [scrollRequest, setScrollRequest] = useState(() => ({ page, seq: 0 }));
  const [citedPage, setCitedPage] = useState(() => (cited ? page : null));
  const [panelWidth, setPanelWidth] = useState(0);
  const [fitPercent, setFitPercent] = useState(null); // the Fit zoom in %, from the pages view
  // null: fit the page to the panel's width; else a step of ZOOM_STEPS.
  const [manualZoomIndex, setManualZoomIndex] = useState(null);
  const fit = manualZoomIndex === null;
  const fitIndex = framed || fitPercent === null
    ? panelWidth > 0 ? getFitZoomIndex(panelWidth) : 2
    : Math.max(0, ZOOM_STEPS.findLastIndex((step) => step <= fitPercent + 0.5));
  const zoomIndex = manualZoomIndex ?? fitIndex;
  const zoom = ZOOM_STEPS[zoomIndex];
  const view = fit ? "view=FitH" : `zoom=${zoom}`;
  const meta = material.meta ?? `PDF · ${formatFileSize(material.size ?? 0)}`;
  const onCitedPage = citedPage !== null && page === citedPage;

  // null: not chosen yet — open when the panel is wide enough.
  const [pagesChoice, setPagesChoice] = useState(null);
  const hasPages = pageCount !== null && pageCount > 1;
  const showPages = hasPages && (pagesChoice ?? panelWidth >= PAGES_OPEN_WIDTH);
  const tilesRef = useRef(null);

  // Keep the current page's numbered tile in view (the thumbnails do this themselves).
  useEffect(() => {
    if (showPages && !drawn) tilesRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: "nearest" });
  }, [page, showPages, drawn]);

  const canGoBack = page > 1;
  const canGoForward = pageCount === null || page < pageCount;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;

    const measure = () => setPanelWidth(panel.clientWidth);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  function goToPage(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) return;
    const target = pageCount ? Math.min(number, pageCount) : number;
    setPage(target);
    setScrollRequest((previous) => ({ page: target, seq: previous.seq + 1 }));
    setCitedPage(null);
  }

  // Scrolling the pages moves the current page without scrolling again.
  const handleScrolledTo = useCallback((number) => setPage(number), []);

  // Zoom in / out from Fit steps from the fixed zoom nearest below the fitted one.
  function zoomBy(step) {
    setManualZoomIndex(Math.max(0, Math.min(ZOOM_STEPS.length - 1, zoomIndex + step)));
  }

  let content;
  if (!ready || (!framed && !drawn)) {
    content = (
      <div className="viewer__content viewer__message-wrap" role={material.loadError ? "alert" : "status"}>
        <p className="notice">{material.loadError || "Loading PDF…"}</p>
      </div>
    );
  } else if (drawn) {
    content = (
      <PdfPagesView
        lib={drawn.lib}
        doc={drawn.doc}
        sizes={drawn.sizes}
        zoom={fit ? null : zoom}
        scrollRequest={scrollRequest}
        citedPage={onCitedPage ? citedPage : null}
        onPageChange={handleScrolledTo}
        onFitPercent={setFitPercent}
      />
    );
  } else {
    content = (
      <div className={`viewer__content pdf__frame-wrap ${onCitedPage ? "pdf__frame-wrap--cited" : ""}`}>
        {/* `key` reloads the frame when the page or zoom changes so the browser jumps there.
            The browser's own toolbar and thumbnails are hidden: the toolbar above has the
            page and zoom controls, and "Open in a new tab" shows the full viewer. */}
        <iframe
          key={`${page}-${view}`}
          className="pdf__frame"
          title={material.name}
          src={`${material.url}#page=${page}&${view}&toolbar=0&navpanes=0`}
        />
      </div>
    );
  }

  return (
    <section ref={panelRef} className="viewer pdf" aria-label={`PDF viewer: ${material.name}`}>
      <ViewerHead title={material.name} meta={meta} newTabUrl={material.url ?? null} widen={widen} onClose={onCollapse} />

      <div className="viewer__toolbar">
        {hasPages && (
          <IconButton
            icon="sidebar"
            label={showPages ? "Hide pages" : "Show pages"}
            aria-expanded={showPages}
            aria-controls="pdf-pages"
            className={showPages ? "pdf__pages-toggle--on" : ""}
            onClick={() => setPagesChoice(!showPages)}
          />
        )}
        <IconButton icon="arrowUp" label="First page" disabled={!canGoBack} onClick={() => goToPage(1)} />
        <IconButton icon="chevronLeft" label="Previous page" disabled={!canGoBack} onClick={() => goToPage(page - 1)} />
        <span className={`viewer__position ${onCitedPage ? "viewer__position--cited" : ""}`}>
          <label className="visually-hidden" htmlFor="pdf-page">
            Page number
          </label>
          <input
            id="pdf-page"
            className="pdf__page-input"
            inputMode="numeric"
            value={page}
            aria-describedby={onCitedPage ? "pdf-cited" : undefined}
            onChange={(event) => goToPage(event.target.value)}
          />
          <span className="pdf__page-count">{pageCount ? `of ${pageCount}` : "page"}</span>
        </span>
        <IconButton icon="chevronRight" label="Next page" disabled={!canGoForward} onClick={() => goToPage(page + 1)} />
        {pageCount !== null && (
          <IconButton icon="arrowDown" label="Last page" disabled={!canGoForward} onClick={() => goToPage(pageCount)} />
        )}
        <span className="viewer__spacer" />
        <ZoomControls
          zoom={zoom}
          label={fit ? "Fit" : undefined}
          canZoomOut={zoomIndex > 0 || (fit && Boolean(drawn) && fitPercent > ZOOM_STEPS[0] + 0.5)}
          canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
          onZoomOut={() => zoomBy(fit && drawn && fitPercent > ZOOM_STEPS[zoomIndex] + 0.5 ? 0 : -1)}
          onZoomIn={() => zoomBy(1)}
        />
        {!fit && (
          <button type="button" className="viewer__fit" onClick={() => setManualZoomIndex(null)}>
            Fit
          </button>
        )}
      </div>

      {onCitedPage && (
        <ViewerBanner>
          <span id="pdf-cited">Opened from a source in the answer: page {citedPage}</span>
        </ViewerBanner>
      )}

      <div className="pdf__body">
        {showPages &&
          (drawn ? (
            <PdfThumbnails
              lib={drawn.lib}
              doc={drawn.doc}
              sizes={drawn.sizes}
              page={page}
              citedPage={citedPage}
              onSelect={goToPage}
            />
          ) : (
            <nav id="pdf-pages" className="pdf__pages" aria-label="Pages" ref={tilesRef}>
              <ol>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                  <li key={number}>
                    <button
                      type="button"
                      className={`pdf__page-tile ${number === citedPage ? "pdf__page-tile--cited" : ""}`}
                      aria-current={number === page ? "page" : undefined}
                      aria-label={`Page ${number}${number === citedPage ? " (cited in the answer)" : ""}`}
                      onClick={() => goToPage(number)}
                    >
                      <span className="pdf__page-sheet" aria-hidden="true" />
                      <span className="pdf__page-number">{number}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          ))}
        {content}
      </div>
    </section>
  );
}
