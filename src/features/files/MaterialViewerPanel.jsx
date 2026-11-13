import { useEffect, useState } from "react";
import "katex/dist/katex.min.css";

import Icon from "../../components/ui/Icon.jsx";
import { renderMarkdown } from "../../services/notebook/markdown.js";
import { formatFileSize, groupOf } from "../../services/materials/materialTypes.js";
import { ViewerHead, ZoomControls } from "./ViewerChrome.jsx";
import "../notebook/notebook.css"; // .markdown-body styles
import "./files.css";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

/*
  Viewer for Markdown notes beside the chat: the file is rendered (sanitised), with zoom,
  download and open in a new tab. Slides, notebooks and images use LectureContentPanel.

  Props:
    material    { name, type: "notes", size, file, url }
    onCollapse  closes the viewer
*/
export default function MaterialViewerPanel({ material, onCollapse, widen = null }) {
  const group = groupOf(material.type);
  const [markdown, setMarkdown] = useState({ html: null, error: null });
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    let cancelled = false;
    material.file.text().then(
      (text) => !cancelled && setMarkdown({ html: renderMarkdown(text), error: null }),
      (error) => !cancelled && setMarkdown({ html: null, error: error.message })
    );
    return () => {
      cancelled = true;
    };
  }, [material]);

  return (
    <section className="viewer" aria-label={`Viewer: ${material.name}`}>
      <ViewerHead
        icon={group.icon}
        title={material.name}
        meta={`${group.short} · ${formatFileSize(material.size)}`}
        newTabUrl={material.url}
        widen={widen}
        onClose={onCollapse}
      >
        <a className="icon-btn" href={material.url} download={material.name} aria-label={`Download ${material.name}`} title="Download">
          <Icon name="download" />
        </a>
      </ViewerHead>

      <div className="viewer__toolbar">
        <span className="viewer__spacer" />
        <ZoomControls
          zoom={zoom}
          canZoomOut={zoom > ZOOM_MIN}
          canZoomIn={zoom < ZOOM_MAX}
          onZoomOut={() => setZoom(zoom - 10)}
          onZoomIn={() => setZoom(zoom + 10)}
        />
      </div>

      <div className="viewer__content viewer__body" style={{ "--viewer-zoom": zoom / 100 }}>
        {markdown.error ? (
          <p className="viewer__message" role="alert">
            This file could not be read ({markdown.error}).
          </p>
        ) : markdown.html === null ? (
          <p className="viewer__message" role="status">
            Opening…
          </p>
        ) : (
          <article className="markdown-body viewer__document viewer__zoomed" dangerouslySetInnerHTML={{ __html: markdown.html }} />
        )}
      </div>
    </section>
  );
}
