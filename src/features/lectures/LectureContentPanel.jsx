import { useEffect, useRef, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { fetchLectureFile, getLectureContent } from "../../api/services/lectures.js";
import { lectureMeta, STATUS_LABEL, displayStatus } from "./materialTypes.js";
import "./lectures.css";

/*
  Centre panel for slides, notebooks and images (PDFs use PdfViewerPanel).

  Shows the text Lectra extracted from the file, one block per slide or notebook cell,
  in the same order as the original. `focus` ({ sourceType, sourceNumber }) scrolls to
  and highlights the slide or cell an assistant answer cited.

  Props:
    lecture    the backend lecture
    focus      optional source to highlight
    onRetry    retries failed processing
    onClose    closes the panel
*/
export default function LectureContentPanel({ lecture, focus, onRetry, onClose }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const bodyRef = useRef(null);
  const status = displayStatus(lecture.processing_status);
  // A backend without AI processing sends no processing fields and has no file/content
  // endpoints; the stored file is then opened from its S3 URL.
  const basic = lecture.processing_status === undefined;
  const isImage = basic ? !/(pdf|powerpoint|presentation|ipynb|markdown)/.test(lecture.file_type) : lecture.source_type == null;

  useEffect(() => {
    if (status !== "completed") return undefined;
    const controller = new AbortController();
    getLectureContent(lecture.id, { signal: controller.signal }).then(setContent, (err) => {
      if (!controller.signal.aborted) setError(err);
    });
    return () => controller.abort();
  }, [lecture.id, lecture.content_version, status]);

  useEffect(() => {
    if (!isImage || basic) return undefined;
    let url = null;
    const controller = new AbortController();
    fetchLectureFile(lecture.id, { signal: controller.signal }).then(
      (blob) => {
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      },
      () => {}
    );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [isImage, basic, lecture.id]);

  useEffect(() => {
    if (!focus || !content) return;
    const target = bodyRef.current?.querySelector(`[data-source="${focus.sourceType}-${focus.sourceNumber}"]`);
    target?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, [focus, content]);

  async function download() {
    setDownloading(true);
    try {
      const blob = await fetchLectureFile(lecture.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = lecture.original_filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err);
    } finally {
      setDownloading(false);
    }
  }

  // Group sections by source number so a slide's notes / a cell's output sit with it.
  const groups = [];
  for (const section of content?.sections ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.number === section.source_number) last.sections.push(section);
    else groups.push({ number: section.source_number, type: section.source_type, sections: [section] });
  }

  return (
    <section className="panel center-panel lecture-view" aria-label={`Lecture: ${lecture.title}`}>
      <div className="lecture-view__toolbar">
        <div className="lecture-view__file">
          <Icon name={lecture.source_type === "cell" ? "notebook" : lecture.source_type === "slide" ? "slides" : "book"} />
          <div className="lecture-view__titles">
            <h2 className="lecture-view__title">{lecture.title}</h2>
            <span className="lecture-view__meta">
              {lecture.original_filename} · {lectureMeta(lecture)}
            </span>
          </div>
        </div>
        {basic ? (
          <a className="btn btn--secondary btn--sm" href={lecture.s3_url} target="_blank" rel="noopener noreferrer" download>
            <Icon name="download" />
            Download
          </a>
        ) : (
          <Button size="sm" icon="download" onClick={download} disabled={downloading}>
            {downloading ? "Downloading…" : "Download"}
          </Button>
        )}
        <IconButton icon="close" label="Close lecture" outlined onClick={onClose} />
      </div>

      <div className="lecture-view__body" ref={bodyRef}>
        {lecture.description && <p className="lecture-view__description">{lecture.description}</p>}

        {isImage && (basic ? lecture.s3_url : imageUrl) && (
          <img className="lecture-view__image" src={basic ? lecture.s3_url : imageUrl} alt={lecture.title} />
        )}
        {basic && !isImage && (
          <p className="lecture-view__notice" role="status">
            This file can’t be previewed in the browser — use Download to open it. Reading slides and notebook
            text for the study assistant needs the AI-enabled backend, which this server doesn’t run yet.
          </p>
        )}

        {status === "processing" && (
          <p className="lecture-view__notice" role="status">
            Lectra is reading this file. Its content appears here when processing is complete.
          </p>
        )}
        {(status === "failed" || status === "skipped") && (
          <div className={`lecture-view__notice ${status === "failed" ? "lecture-view__notice--error" : ""}`} role="status">
            <p>
              <strong>{STATUS_LABEL[status]}.</strong> {lecture.processing_error}
            </p>
            {status === "failed" && (
              <Button size="sm" icon="refresh" onClick={onRetry}>
                Retry processing
              </Button>
            )}
          </div>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error.message}
          </p>
        )}
        {status === "completed" && !content && !error && <p className="lecture-view__notice">Loading content…</p>}

        {groups.map((group) => {
          const focused = focus && focus.sourceType === group.type && focus.sourceNumber === group.number;
          return (
            <article
              key={`${group.type}-${group.number}`}
              data-source={`${group.type}-${group.number}`}
              className={`source-block ${focused ? "source-block--focused" : ""}`}
            >
              <h3 className="source-block__title">{group.sections[0].location.replace(/ \(.+\)| output$/, "")}</h3>
              {group.sections.map((section, index) => {
                const code = section.source_label?.startsWith("code") || section.source_label === "output";
                return (
                  <div key={index} className="source-block__part">
                    {section.source_label && <span className="source-block__label">{section.source_label}</span>}
                    {code ? <pre className="source-block__code">{section.text}</pre> : <p className="source-block__text">{section.text}</p>}
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}
