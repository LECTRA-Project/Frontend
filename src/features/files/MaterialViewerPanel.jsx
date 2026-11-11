import { useEffect, useState } from "react";
import "katex/dist/katex.min.css";

import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { renderMarkdown } from "../../services/notebook/markdown.js";
import { formatFileSize, groupOf } from "../../services/materials/materialTypes.js";
import "../notebook/notebook.css"; // .markdown-body styles
import "./files.css";

/*
  Centre-panel viewer for uploaded notes (.md) and slides (.pptx).
  Markdown is rendered (sanitised). Browsers cannot display PowerPoint files, so slides
  show that plainly with a download link instead of a fake preview.

  Props:
    material    { name, type, size, file, url }
    onCollapse  closes the viewer
*/
export default function MaterialViewerPanel({ material, onCollapse }) {
  const group = groupOf(material.type);
  const [markdown, setMarkdown] = useState({ html: null, error: null });

  useEffect(() => {
    if (material.type !== "notes") return undefined;
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
    <section className="panel center-panel pdf" aria-label={`Viewer: ${material.name}`}>
      <div className="pdf__toolbar">
        <div className="pdf__file">
          <Icon name={group.icon} className="pdf__title-icon" />
          <h2 className="pdf__title">{material.name}</h2>
          <span className="pdf__title-meta">
            {group.short} · {formatFileSize(material.size)}
          </span>
        </div>
        <div className="viewer__actions">
          <a className="icon-btn icon-btn--outlined" href={material.url} download={material.name} aria-label={`Download ${material.name}`} title="Download">
            <Icon name="download" />
          </a>
          <IconButton icon="close" label="Close viewer" outlined className="pdf__close" onClick={onCollapse} />
        </div>
      </div>

      <div className="viewer__body">
        {material.type === "notes" ? (
          markdown.error ? (
            <p className="viewer__message" role="alert">
              This file could not be read ({markdown.error}).
            </p>
          ) : markdown.html === null ? (
            <p className="viewer__message" role="status">
              Opening…
            </p>
          ) : (
            <article className="markdown-body viewer__document" dangerouslySetInnerHTML={{ __html: markdown.html }} />
          )
        ) : (
          <div className="viewer__unsupported">
            <span className="viewer__unsupported-icon">
              <Icon name={group.icon} />
            </span>
            <p className="viewer__unsupported-title">Slides can’t be previewed in the browser</p>
            <p className="viewer__message">
              Download the file to open it in PowerPoint, Keynote, LibreOffice Impress or Google Slides.
            </p>
            <a className="btn btn--primary" href={material.url} download={material.name}>
              <Icon name="download" />
              Download {material.name}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
