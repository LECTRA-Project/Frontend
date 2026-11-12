import { useLayoutEffect, useRef, useState } from "react";

import IconButton from "../../components/ui/IconButton.jsx";
import { formatFileSize } from "../../services/materials/materialTypes.js";
import { getFitZoomIndex, ZOOM_STEPS } from "./pdfZoom.js";
import { ViewerBanner, ViewerHead, ZoomControls } from "./ViewerChrome.jsx";
import "./files.css";

/*
  Inline PDF viewer — shown in the material viewer beside the chat (not in a popup).

  The browser's own PDF viewer shows the file (`material.url`). Our page and zoom
  controls are passed to it in the URL (#page=…&zoom=… or view=FitH, toolbar=0), which
  Chrome, Edge and Firefox understand. It opens fitted to the panel's width ("Fit");
  zooming in or out steps from the nearest fixed zoom.

  Props:
    material    the PDF: { name, url, meta?, size?, pages?, loading?, loadError? }
                Lecture PDFs are fetched from the backend by the workspace; `loading`
                is true meanwhile. `pages` is the page count when known.
    initialPage page to open first (e.g. the page an assistant answer cited)
    cited       true when opened from a source in an answer: the banner says so and the
                page number is highlighted until the student moves to another page
    onCollapse  closes the viewer
*/
export default function PdfViewerPanel({ material, initialPage = 1, cited = false, onCollapse }) {
  const pageCount = material.pages ?? null;
  const panelRef = useRef(null);
  const [page, setPage] = useState(() => Math.max(1, Math.min(initialPage, pageCount ?? initialPage)));
  const [citedPage, setCitedPage] = useState(() => (cited ? page : null));
  const [panelWidth, setPanelWidth] = useState(0);
  // null: fit the page to the panel's width (the browser's view=FitH); else a fixed step.
  const [manualZoomIndex, setManualZoomIndex] = useState(null);
  const fit = manualZoomIndex === null;
  const zoomIndex = manualZoomIndex ?? (panelWidth > 0 ? getFitZoomIndex(panelWidth) : 2);
  const zoom = ZOOM_STEPS[zoomIndex];
  const view = fit ? "view=FitH" : `zoom=${zoom}`;
  const meta = material.meta ?? `PDF · ${formatFileSize(material.size ?? 0)}`;
  const onCitedPage = citedPage !== null && page === citedPage;

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
    setPage(pageCount ? Math.min(number, pageCount) : number);
    setCitedPage(null);
  }

  return (
    <section ref={panelRef} className="viewer pdf" aria-label={`PDF viewer: ${material.name}`}>
      <ViewerHead title={material.name} meta={meta} newTabUrl={material.url ?? null} onClose={onCollapse} />

      <div className="viewer__toolbar">
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
        <span className="viewer__spacer" />
        <ZoomControls
          zoom={zoom}
          label={fit ? "Fit" : undefined}
          canZoomOut={zoomIndex > 0}
          canZoomIn={zoomIndex < ZOOM_STEPS.length - 1}
          onZoomOut={() => setManualZoomIndex(zoomIndex - 1)}
          onZoomIn={() => setManualZoomIndex(zoomIndex + 1)}
        />
      </div>

      {onCitedPage && (
        <ViewerBanner>
          <span id="pdf-cited">Opened from a source in the answer: page {citedPage}</span>
        </ViewerBanner>
      )}

      {material.loading || material.loadError || !material.url ? (
        <div className="viewer__content viewer__message-wrap" role={material.loadError ? "alert" : "status"}>
          <p className="notice">{material.loadError || "Loading PDF…"}</p>
        </div>
      ) : (
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
      )}
    </section>
  );
}
