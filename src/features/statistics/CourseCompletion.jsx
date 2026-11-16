import { useId, useState } from "react";
import { Link } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import CompletionRing from "../../components/ui/CompletionRing.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { useApi } from "../../api/useApi.js";
import { getCompletion } from "../../api/services/statistics.js";
import { DWELL_MS } from "../lectures/readingTracker.js";
import { t, useI18n } from "../../i18n/i18n.js";
import "./courseCompletion.css";

/*
  Statistics → "Course completion": how far the student is with each lecture
  (GET /api/stats/completion).

  - The header shows the overall completion (the backend weighs each lecture by its pages).
  - One row per lecture, in the backend's order (least complete first, never re-sorted):
    the title, the completion bar with its %, then the pages read ("52 of 65 pages"; slides
    or cells for those types; an image is "Opened" / "Not opened"), the reading % and the
    best exam % ("—" without a graded exam).
  - "How is completion calculated?" opens the formula, with the weights the backend sends
    (e.g. 70% pages read + 30% best exam score). It is a button that shows and hides the
    text below it, so it works with a keyboard, a mouse and touch alike.
  - Loading, an error with "Try again", and a first-time student without lectures, who is
    told how to start.
*/

// "52 of 65 pages"; source_type null is an image (one page: opened or not).
const PAGES_READ = {
  page: (viewed, total) => (total === 1 ? t("{viewed} of 1 page", { viewed }) : t("{viewed} of {total} pages", { viewed, total })),
  slide: (viewed, total) => (total === 1 ? t("{viewed} of 1 slide", { viewed }) : t("{viewed} of {total} slides", { viewed, total })),
  cell: (viewed, total) => (total === 1 ? t("{viewed} of 1 cell", { viewed }) : t("{viewed} of {total} cells", { viewed, total })),
};

function pagesReadText({ source_type: sourceType, viewed, total }) {
  if (!sourceType) return viewed > 0 ? t("Opened") : t("Not opened");
  if (!total) return t("No pages to read yet");
  return (PAGES_READ[sourceType] ?? PAGES_READ.page)(Math.min(viewed, total), total);
}

const percentText = (value) => t("{percent}%", { percent: value });

function CompletionRow({ lecture }) {
  const percent = Math.min(100, Math.max(0, lecture.completion_percent ?? 0));
  const exam = lecture.best_exam_percent;
  return (
    <li className="completion__row">
      <span className="completion__title" title={lecture.title}>
        {lecture.title}
      </span>
      <span
        className="completion__bar"
        role="meter"
        aria-label={t("Completion of {title}", { title: lecture.title })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={t("{percent}% complete", { percent })}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="completion__percent" aria-hidden="true">
        {percentText(percent)}
      </span>
      <span className="completion__details">
        <span>{pagesReadText(lecture)}</span>
        <span>{t("{percent}% read", { percent: lecture.reading_percent ?? 0 })}</span>
        <span>
          {t("Best exam")}{" "}
          {typeof exam === "number" ? (
            percentText(exam)
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="visually-hidden">{t("no graded exam yet")}</span>
            </>
          )}
        </span>
      </span>
    </li>
  );
}

function CompletionHelp({ weights }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="completion__help">
      <button
        type="button"
        className="completion__help-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="help" size={16} />
        {t("How is completion calculated?")}
      </button>
      <div id={panelId} className="completion__help-text" hidden={!open}>
        <p className="completion__formula">
          {t("Completion = {reading}% pages read + {exam}% best exam score", { reading: weights.reading, exam: weights.exam })}
        </p>
        <ul>
          <li>
            {t("Pages read: the pages, slides or notebook cells you kept on screen in the viewer for {seconds} seconds. An image counts once you open it.", {
              seconds: DWELL_MS / 1000,
            })}
          </li>
          <li>{t("Best exam score: your best graded exam that includes the lecture. Until you have one, it counts as 0%.")}</li>
          <li>{t("The overall value weighs each lecture by its pages, so a long lecture counts more.")}</li>
        </ul>
      </div>
    </div>
  );
}

export default function CourseCompletion() {
  useI18n(); // re-render in a new interface language
  const { data, error, loading, refetch } = useApi(getCompletion, { immediate: true });
  const lectures = data?.lectures ?? [];
  const weights = data?.weights;
  const hasWeights = typeof weights?.reading === "number" && typeof weights?.exam === "number";
  const showOverall = !loading && !error && lectures.length > 0 && typeof data?.overall_percent === "number";

  let body;
  if (loading) {
    body = (
      <p className="completion__state" role="status">
        {t("Loading your course completion…")}
      </p>
    );
  } else if (error) {
    body = (
      <div className="completion__state completion__state--error" role="alert">
        <p>{error.message || t("Unable to load your course completion.")}</p>
        <Button size="sm" icon="refresh" onClick={() => refetch().catch(() => {})}>
          {t("Try again")}
        </Button>
      </div>
    );
  } else if (lectures.length === 0) {
    body = (
      <div className="completion__empty">
        <p className="completion__empty-title">{t("No lectures yet")}</p>
        <p>{t("Upload a lecture and read it to see your progress.")}</p>
        <Link to="/workspace/home" className="btn btn--primary btn--sm">
          <Icon name="upload" />
          {t("Upload a lecture")}
        </Link>
      </div>
    );
  } else {
    body = (
      <ol className="completion__list" aria-label={t("Lectures, least complete first")}>
        {lectures.map((lecture) => (
          <CompletionRow key={lecture.lecture_id} lecture={lecture} />
        ))}
      </ol>
    );
  }

  return (
    <section className="card completion" aria-labelledby="completion-title" aria-busy={loading || undefined}>
      <div className="completion__head">
        <div>
          <h2 id="completion-title" className="card__title">
            {t("Course completion")}
          </h2>
          <p className="card__subtitle">{t("How far you are with each lecture, least complete first.")}</p>
        </div>
        {showOverall && (
          <p className="completion__overall" data-testid="completion-overall">
            <CompletionRing percent={data.overall_percent} size={40} decorative />
            <span>
              <strong>{percentText(data.overall_percent)}</strong>
              <span className="completion__overall-label">{t("overall")}</span>
            </span>
          </p>
        )}
      </div>
      {!loading && !error && hasWeights && <CompletionHelp weights={weights} />}
      {body}
    </section>
  );
}
