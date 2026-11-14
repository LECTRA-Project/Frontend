import { useEffect, useRef, useState } from "react";

import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { fetchLectureFile, getLectureContent } from "../../api/services/lectures.js";
import { t, useI18n } from "../../i18n/i18n.js";
import { citedBannerText, sourcePlace } from "../files/citedText.js";
import { ViewerBanner, ViewerHead, ZoomControls } from "../files/ViewerChrome.jsx";
import { lectureMeta, materialType, STATUS_LABEL, displayStatus } from "./materialTypes.js";
import "./lectures.css";

// What the toolbar says for each kind of block (functions: read in the current language).
const UNIT = {
  page: { position: (number) => t("Page {number}", { number }), previous: () => t("Previous page"), next: () => t("Next page") },
  slide: { position: (number) => t("Slide {number}", { number }), previous: () => t("Previous slide"), next: () => t("Next slide") },
  cell: { position: (number) => t("Cell {number}", { number }), previous: () => t("Previous cell"), next: () => t("Next cell") },
  section: {
    position: (number) => t("Section {number}", { number }),
    previous: () => t("Previous section"),
    next: () => t("Next section"),
  },
};
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

/*
  PowerPoint can't be drawn by the browser. Slides are shown with Microsoft's Office Online
  viewer, which loads the file's public S3 URL on Microsoft's side — so no CORS rule on the
  bucket is needed. The file must stay publicly readable for this to work; without a public
  https URL the extracted slide text is shown.
*/
export const OFFICE_VIEWER = "https://view.officeapps.live.com/op/embed.aspx?src=";
const isSlides = (lecture) => /powerpoint|presentation/.test(lecture.file_type ?? "") || /\.pptx?$/i.test(lecture.original_filename ?? "");

/*
  Viewer for slides, notebooks and images beside the chat (PDFs use PdfViewerPanel).
  PowerPoint slides are shown as real slides in the Office Online viewer (see OFFICE_VIEWER),
  except when opened from a source in an answer: then the slide text is shown with the cited
  slide highlighted, because the Office viewer can't open at a given slide.

  Shows the text Lectra extracted from the file, one block per slide or notebook cell,
  in the same order as the original. The toolbar steps through the blocks and zooms.
  `focus` ({ sourceType, sourceNumber }) scrolls to that slide or cell; with `cited` it is
  also highlighted and a banner says it was opened from a source in an answer, until the
  student moves on.

  Props:
    lecture           the backend lecture
    focus             optional place to open at
    cited             true when opened from a source in an answer
    citedIn           where that source was: "the answer" (default) or "the exam results"
    onRetry           retries failed processing
    onClose           closes the viewer
    onOpenInNotebook  optional (notebooks): opens the file in the runnable notebook
*/
export default function LectureContentPanel({ lecture, focus, cited = false, citedIn = "the answer", onRetry, onClose, onOpenInNotebook = null, widen = null, switcher = null }) {
  useI18n(); // re-render in a new interface language
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [current, setCurrent] = useState(null); // index of the block in view
  const [citedActive, setCitedActive] = useState(Boolean(cited && focus));
  const [zoom, setZoom] = useState(100);
  const bodyRef = useRef(null);
  const scrollFrame = useRef(0);
  const status = displayStatus(lecture.processing_status);
  // A backend without AI processing sends no processing fields and has no file/content
  // endpoints; the stored file is then opened from its S3 URL.
  const basic = lecture.processing_status === undefined;
  // An image is shown as the picture only: the text the backend reads from it (for the
  // study assistant's search) is not shown in the viewer.
  const isImage = basic
    ? !/(pdf|powerpoint|presentation|ipynb|markdown)/.test(lecture.file_type)
    : materialType(lecture.file_type) === "image" || lecture.source_type == null;
  const officeSlides = isSlides(lecture) && /^https:\/\//.test(lecture.s3_url ?? "") && !(cited && focus);

  useEffect(() => {
    if (status !== "completed" || officeSlides || isImage) return undefined;
    const controller = new AbortController();
    getLectureContent(lecture.id, { signal: controller.signal }).then(setContent, (err) => {
      if (!controller.signal.aborted) setError(err);
    });
    return () => controller.abort();
  }, [lecture.id, lecture.content_version, status, officeSlides, isImage]);

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

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  // Group sections by source number so a slide's notes / a cell's output sit with it.
  const groups = [];
  for (const section of content?.sections ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.number === section.source_number) last.sections.push(section);
    else groups.push({ number: section.source_number, type: section.source_type, sections: [section] });
  }
  const focusIndex = focus ? groups.findIndex((group) => group.type === focus.sourceType && group.number === focus.sourceNumber) : -1;
  const shown = current ?? Math.max(0, focusIndex);
  const unit = UNIT[groups[shown]?.type ?? lecture.source_type] ?? UNIT.section;

  // Open at the focused slide or cell once the content is there.
  useEffect(() => {
    if (!focus || !content) return;
    const target = bodyRef.current?.querySelector(`[data-source="${focus.sourceType}-${focus.sourceNumber}"]`);
    target?.scrollIntoView?.({ block: "start" });
  }, [focus, content]);

  function goTo(index) {
    const group = groups[index];
    if (!group) return;
    setCurrent(index);
    setCitedActive(false);
    bodyRef.current?.querySelector(`[data-source="${group.type}-${group.number}"]`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }

  // The toolbar follows manual scrolling: the first block still in view is the current one.
  function handleScroll() {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      const body = bodyRef.current;
      if (!body) return;
      const top = body.getBoundingClientRect().top + 8;
      const blocks = [...body.querySelectorAll("[data-source]")];
      const index = blocks.findIndex((block) => block.getBoundingClientRect().bottom > top);
      if (index >= 0 && index !== shown) setCurrent(index);
    });
  }

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

  const icon = lecture.source_type === "cell" ? "code" : lecture.source_type === "slide" ? "slides" : "book";

  return (
    <section className="viewer lecture-view" aria-label={t("Lecture: {title}", { title: lecture.title })}>
      <ViewerHead icon={icon} title={lecture.title} meta={`${lecture.original_filename} · ${lectureMeta(lecture)}`} widen={widen} switcher={switcher} onClose={onClose}>
        {onOpenInNotebook && (
          <Button size="sm" icon="play" onClick={onOpenInNotebook} title={t("Open this notebook in the runnable notebook")}>
            {t("Run in notebook")}
          </Button>
        )}
        {basic ? (
          <a className="icon-btn" href={lecture.s3_url} target="_blank" rel="noopener noreferrer" download aria-label={t("Download")} title={t("Download")}>
            <Icon name="download" />
          </a>
        ) : (
          <IconButton icon="download" label={downloading ? t("Downloading…") : t("Download")} onClick={download} disabled={downloading} />
        )}
      </ViewerHead>

      {isImage && (
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
      )}
      {groups.length > 0 && (
        <div className="viewer__toolbar">
          <IconButton icon="chevronLeft" label={unit.previous()} disabled={shown <= 0} onClick={() => goTo(shown - 1)} />
          <span className={`viewer__position ${citedActive && shown === focusIndex ? "viewer__position--cited" : ""}`}>
            {unit.position(groups[shown]?.number)}
          </span>
          <IconButton
            icon="chevronRight"
            label={unit.next()}
            disabled={shown >= groups.length - 1}
            onClick={() => goTo(shown + 1)}
          />
          <span className="viewer__spacer" />
          <ZoomControls
            zoom={zoom}
            canZoomOut={zoom > ZOOM_MIN}
            canZoomIn={zoom < ZOOM_MAX}
            onZoomOut={() => setZoom(zoom - 10)}
            onZoomIn={() => setZoom(zoom + 10)}
          />
        </div>
      )}

      {citedActive && focusIndex >= 0 && (
        <ViewerBanner>
          {citedBannerText(citedIn, sourcePlace(focus.sourceType, focus.sourceNumber))}
        </ViewerBanner>
      )}

      <div className="viewer__content lecture-view__body" ref={bodyRef} onScroll={handleScroll} style={{ "--viewer-zoom": zoom / 100 }}>
        <div className="viewer__zoomed">
          {isImage && (basic ? lecture.s3_url : imageUrl) && (
            <img className="lecture-view__image" src={basic ? lecture.s3_url : imageUrl} alt={lecture.title} />
          )}
          {officeSlides && (
            <iframe
              className="lecture-view__slides"
              title={t("Slides: {title}", { title: lecture.title })}
              src={`${OFFICE_VIEWER}${encodeURIComponent(lecture.s3_url)}`}
              allowFullScreen
            />
          )}
          {basic && !isImage && !officeSlides && (
            <p className="lecture-view__notice" role="status">
              {t(
                "This file can’t be previewed in the browser — use Download to open it. Reading slides and notebook text for the study assistant needs the AI-enabled backend, which this server doesn’t run yet."
              )}
            </p>
          )}

          {status === "processing" && !isImage && (
            <p className="lecture-view__notice" role="status">
              {t("Lectra is reading this file. Its content appears here when processing is complete.")}
            </p>
          )}
          {(status === "failed" || status === "skipped") && (
            <div className={`lecture-view__notice ${status === "failed" ? "lecture-view__notice--error" : ""}`} role="status">
              <p>
                <strong>{STATUS_LABEL[status]}.</strong> {lecture.processing_error}
              </p>
              {status === "failed" && (
                <Button size="sm" icon="refresh" onClick={onRetry}>
                  {t("Retry processing")}
                </Button>
              )}
            </div>
          )}
          {error && (
            <p className="field__error" role="alert">
              {error.message}
            </p>
          )}
          {status === "completed" && !officeSlides && !isImage && !content && !error && <p className="lecture-view__notice">{t("Loading content…")}</p>}

          {groups.map((group, index) => {
            const highlighted = citedActive && index === focusIndex;
            return (
              <article
                key={`${group.type}-${group.number}`}
                data-source={`${group.type}-${group.number}`}
                className={`source-block ${highlighted ? "source-block--focused" : ""}`}
              >
                <h3 className="source-block__title">{group.sections[0].location.replace(/ \(.+\)| output$/, "")}</h3>
                {group.sections.map((section, part) => {
                  const code = section.source_label?.startsWith("code") || section.source_label === "output";
                  return (
                    <div key={part} className="source-block__part">
                      {section.source_label && <span className="source-block__label">{section.source_label}</span>}
                      {code ? <pre className="source-block__code">{section.text}</pre> : <p className="source-block__text">{section.text}</p>}
                    </div>
                  );
                })}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
