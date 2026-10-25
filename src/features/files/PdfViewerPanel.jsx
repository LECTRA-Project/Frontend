import { useEffect, useRef, useState } from "react";

import IconButton from "../../components/ui/IconButton.jsx";
import Icon from "../../components/ui/Icon.jsx";
import "./files.css";

/*
  Inline PDF viewer — shown in the workspace's centre panel (not in a popup).

  - If the material has a real file (`material.url`, from a PDF picked in the upload
    dialog), the browser's own PDF viewer shows it. Our page and zoom controls are passed
    to it in the URL (#page=…&zoom=…), which Chrome, Edge and Firefox understand.
  - The demo items have no file behind them, so a neutral blank page with grey
    placeholder lines is shown instead. No document text is invented.

  Props:
    material    the PDF to show: { name, meta, pages?, url? }
    onCollapse  called by the collapse button; the workspace then shows the
                notebook or exam view again
*/
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

export default function PdfViewerPanel({ material, onCollapse }) {
  const hasRealFile = Boolean(material.url);
  const pageCount = material.pages ?? null; // unknown for real files
  const panelRef = useRef(null);
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2); // 100%
  const zoom = ZOOM_STEPS[zoomIndex];

  const canGoBack = page > 1;
  const canGoForward = pageCount === null || page < pageCount;

  // On narrow screens the panels are stacked, so bring the viewer into view when it opens.
  // On desktop it is already visible and nothing moves.
  useEffect(() => {
    if (window.matchMedia("(max-width: 880px)").matches) {
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
          <IconButton icon="arrowLeft" label="Collapse PDF viewer" outlined onClick={onCollapse} />
          <Icon name="fileText" className="pdf__title-icon" />
          <h2 className="pdf__title">{material.name}</h2>
          <span className="pdf__title-meta">{material.meta}</span>
        </div>

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
            <IconButton icon="zoomOut" label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex(zoomIndex - 1)} />
            <span className="pdf__zoom-value" aria-live="polite">
              {zoom}%
            </span>
            <IconButton
              icon="zoomIn"
              label="Zoom in"
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex(zoomIndex + 1)}
            />
          </div>
        </div>
      </div>

      {hasRealFile ? (
        <div className="pdf__frame-wrap">
          {/* `key` reloads the frame when the page or zoom changes so the browser jumps there. */}
          <iframe
            key={`${page}-${zoom}`}
            className="pdf__frame"
            title={material.name}
            src={`${material.url}#page=${page}&zoom=${zoom}`}
          />
        </div>
      ) : (
        <div className="pdf__content">
          <ol className="pdf__thumbs" aria-label="Pages">
            {Array.from({ length: pageCount ?? 1 }, (_, index) => (
              <li key={index}>
                <button
                  type="button"
                  className={`pdf__thumb ${page === index + 1 ? "pdf__thumb--active" : ""}`}
                  aria-label={`Page ${index + 1}`}
                  aria-current={page === index + 1 ? "page" : undefined}
                  onClick={() => setPage(index + 1)}
                >
                  <PlaceholderLines compact />
                </button>
                <span className="pdf__thumb-number">{index + 1}</span>
              </li>
            ))}
          </ol>

          <div className="pdf__stage">
            <div className="pdf__page" style={{ width: `${(382 * zoom) / 100}px` }} aria-label={`Blank preview of page ${page}`}>
              <PlaceholderLines />
              <span className="pdf__page-number">{page}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* Grey bars that stand in for text on the blank demo page. */
function PlaceholderLines({ compact = false }) {
  const paragraphs = [6, 4, 5, 3];
  return (
    <div className={`placeholder-lines ${compact ? "placeholder-lines--compact" : ""}`} aria-hidden="true">
      <span className="placeholder-lines__heading" />
      <span className="placeholder-lines__sub" />
      {paragraphs.map((lines, p) => (
        <div key={p} className="placeholder-lines__para">
          {Array.from({ length: lines }, (_, l) => (
            <span key={l} style={{ width: l === lines - 1 ? "62%" : `${96 - ((l * 7) % 9)}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
