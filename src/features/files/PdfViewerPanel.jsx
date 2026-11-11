import { useEffect, useLayoutEffect, useRef, useState } from "react";

import IconButton from "../../components/ui/IconButton.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { formatFileSize } from "../../services/materials/materialTypes.js";
import { getFitZoomIndex, ZOOM_STEPS } from "./pdfZoom.js";
import "./files.css";

/*
  Inline PDF viewer — shown in the workspace's centre panel (not in a popup).

  The browser's own PDF viewer shows the file (`material.url`). Our page and zoom
  controls are passed to it in the URL (#page=…&zoom=…), which Chrome, Edge and
  Firefox understand.

  Props:
    material    the PDF: { name, url, meta?, size?, pages?, loading?, loadError? }
                Lecture PDFs are fetched from the backend by the workspace; `loading`
                is true meanwhile. `pages` is the page count when known.
    initialPage page to open first (e.g. the page an assistant answer cited)
    onCollapse  called by the close button; the workspace then shows the
                notebook or exam view again
*/
export default function PdfViewerPanel({ material, initialPage = 1, onCollapse }) {
  const pageCount = material.pages ?? null;
  const panelRef = useRef(null);
  const [page, setPage] = useState(() => Math.max(1, Math.min(initialPage, pageCount ?? initialPage)));
  const [panelWidth, setPanelWidth] = useState(0);
  const [manualZoomIndex, setManualZoomIndex] = useState(null);
  const zoomIndex = manualZoomIndex ?? (panelWidth > 0 ? getFitZoomIndex(panelWidth) : 2);
  const zoom = ZOOM_STEPS[zoomIndex];
  const meta = material.meta ?? `PDF · ${formatFileSize(material.size ?? 0)}`;

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

  // On narrow screens the panels are stacked, so bring the viewer into view when it opens.
  // On desktop it is already visible and nothing moves.
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 880px)").matches) {
      panelRef.current?.scrollIntoView({ block: "start" });
    }
  }, []);

  function goToPage(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) return;
    setPage(pageCount ? Math.min(number, pageCount) : number);
  }

  return (
    <section ref={panelRef} className="panel center-panel pdf" aria-label={`PDF viewer: ${material.name}`}>
      <div className="pdf__toolbar">
        <div className="pdf__file">
          <Icon name="fileText" className="pdf__title-icon" />
          <h2 className="pdf__title">{material.name}</h2>
          <span className="pdf__title-meta">{meta}</span>
        </div>

        <IconButton
          icon="close"
          label="Close PDF viewer"
          outlined
          className="pdf__close"
          onClick={onCollapse}
        />

        <div className="pdf__controls">
          <div className="pdf__pager">
            <IconButton icon="chevronLeft" label="Previous page" disabled={!canGoBack} onClick={() => setPage(page - 1)} />
            <label className="visually-hidden" htmlFor="pdf-page">
              Page number
            </label>
            <input
              id="pdf-page"
              className="pdf__page-input"
              inputMode="numeric"
              value={page}
              onChange={(event) => goToPage(event.target.value)}
            />
            <span className="pdf__page-count">{pageCount ? `of ${pageCount}` : "page"}</span>
            <IconButton icon="chevronRight" label="Next page" disabled={!canGoForward} onClick={() => setPage(page + 1)} />
          </div>

          <div className="pdf__zoom">
            <IconButton icon="zoomOut" label="Zoom out" disabled={zoomIndex === 0} onClick={() => setManualZoomIndex(zoomIndex - 1)} />
            <span className="pdf__zoom-value" aria-live="polite">
              {zoom}%
            </span>
            <IconButton
              icon="zoomIn"
              label="Zoom in"
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setManualZoomIndex(zoomIndex + 1)}
            />
          </div>
        </div>
      </div>

      {material.loading || material.loadError || !material.url ? (
        <div className="pdf__frame-wrap viewer__message-wrap" role={material.loadError ? "alert" : "status"}>
          <p className="notice">{material.loadError || "Loading PDF…"}</p>
        </div>
      ) : (
        <div className="pdf__frame-wrap">
          {/* `key` reloads the frame when the page or zoom changes so the browser jumps there. */}
          <iframe
            key={`${page}-${zoom}`}
            className="pdf__frame"
            title={material.name}
            src={`${material.url}#page=${page}&zoom=${zoom}`}
          />
        </div>
      )}
    </section>
  );
}
