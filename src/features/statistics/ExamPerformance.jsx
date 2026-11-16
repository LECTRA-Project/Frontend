import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { getExamStats } from "../../api/services/statistics.js";
import { formatExamDate } from "../exam/examFormat.js";
import { t, useI18n } from "../../i18n/i18n.js";
import PerformanceChart from "./PerformanceChart.jsx";
import {
  correctOfText,
  examsText,
  lastWeeksFrom,
  percentText,
  practiceLectureIds,
  questionTypeLabel,
} from "./examStatsText.js";
import "./examPerformance.css";

/*
  Statistics → "Exam performance": how the student's submitted exams went
  (GET /api/stats/exams), between the overall cards and the course completion.

  - Header: the number of exams, their average and best score, and the period
    (All time / Last 4 weeks, sent as `from`).
  - Average score per week: PerformanceChart.jsx (by_week), with a table to open.
  - Per lecture (by_lecture, lowest average first): the average as a bar, the best score
    and the number of exams. Per question type (by_type): the share of correct answers as a
    bar, and the share of the points (partly correct answers earn some).
  - Weakest concepts (up to 5): "2 of 6 correct" and the %, with "Practice this", which
    opens the exam setup with the concept's lectures chosen (lectures that no longer exist
    are left out; without any, there is no button).
  - History, newest first: date, score ("Waiting for a grade" while an answer isn't
    graded), questions and materials. The long materials come last, so a phone shows the
    score without scrolling. A row opens the exam's results. The table scrolls sideways
    inside its own box on a narrow screen.
  - Loading, an error with "Try again", and no submitted exam yet (in the period).
*/

const HISTORY_ROWS = 10;
const RANGES = [
  { value: "all", label: () => t("All time") },
  { value: "4w", label: () => t("Last 4 weeks") },
];

/* The stats for the period; a newer period or a retry cancels the request before it. */
function useExamStats(range) {
  const [attempt, setAttempt] = useState(0);
  // The answer to the request `key`; while it doesn't belong to the current key, it is loading.
  const key = `${range}:${attempt}`;
  const [result, setResult] = useState({ key: null, data: null, error: null });
  // Once any exam was seen the period stays offered, also while a new period loads.
  const [hasExams, setHasExams] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getExamStats({ from: range === "4w" ? lastWeeksFrom(4) : undefined, signal: controller.signal }).then(
      (data) => {
        setResult({ key, data, error: null });
        if (data?.exams_submitted > 0) setHasExams(true);
      },
      (error) => {
        if (!controller.signal.aborted) setResult({ key, data: null, error });
      }
    );
    return () => controller.abort();
  }, [key, range]);
  const loading = result.key !== key;
  return {
    data: loading ? null : result.data,
    error: loading ? null : result.error,
    loading,
    hasExams,
    retry: () => setAttempt((value) => value + 1),
  };
}

function Meter({ percent, label, best }) {
  const value = Math.min(100, Math.max(0, percent ?? 0));
  return (
    <span
      className="exam-stats__bar"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={percentText(value)}
    >
      <span className="exam-stats__fill" style={{ width: `${value}%` }} />
      {typeof best === "number" && <span className="exam-stats__best" style={{ left: `${Math.min(100, Math.max(0, best))}%` }} />}
    </span>
  );
}

function Block({ title, children, className = "" }) {
  const id = useId();
  return (
    <section className={`exam-stats__block ${className}`} aria-labelledby={id}>
      <h3 id={id} className="exam-stats__heading">
        {title}
      </h3>
      {children}
    </section>
  );
}

function WeeklyChart({ weeks }) {
  const id = useId();
  return (
    <section className="exam-stats__block exam-stats__block--wide" aria-labelledby={id}>
      <h3 id={id} className="exam-stats__heading">
        {t("Average score per week")}
      </h3>
      <PerformanceChart weeks={weeks} titleId={id} />
      {weeks.length === 1 && <p className="exam-stats__muted">{t("One week so far. Each week with a graded exam adds a point.")}</p>}
    </section>
  );
}

function ByLecture({ lectures }) {
  return (
    <Block title={t("Per lecture")}>
      <ol className="exam-stats__rows" aria-label={t("Lectures, lowest average first")}>
        {lectures.map((lecture) => (
          <li key={`${lecture.lecture_id ?? "deleted"}:${lecture.title}`} className="exam-stats__row">
            <span className="exam-stats__name" title={lecture.title}>
              {lecture.title}
              {!lecture.lecture_id && <span className="exam-stats__tag">{t("deleted")}</span>}
            </span>
            <Meter percent={lecture.average_percent} best={lecture.best_percent} label={t("Average score in {title}", { title: lecture.title })} />
            <span className="exam-stats__percent" aria-hidden="true">
              {percentText(lecture.average_percent)}
            </span>
            <span className="exam-stats__details">
              <span>{t("Average {percent}%", { percent: lecture.average_percent })}</span>
              <span>{t("Best {percent}%", { percent: lecture.best_percent })}</span>
              <span>{examsText(lecture.exams)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Block>
  );
}

function ByType({ types }) {
  return (
    <Block title={t("Per question type")}>
      <ul className="exam-stats__rows">
        {types.map((item) => {
          const label = questionTypeLabel(item.type);
          return (
            <li key={item.type} className="exam-stats__row">
              <span className="exam-stats__name">{label}</span>
              <Meter percent={item.correct_percent} label={t("Correct answers in {type}", { type: label })} />
              <span className="exam-stats__percent" aria-hidden="true">
                {percentText(item.correct_percent)}
              </span>
              <span className="exam-stats__details">
                <span>{correctOfText(item.correct, item.questions)}</span>
                <span>
                  {typeof item.points_percent === "number" ? t("{percent}% of the points", { percent: item.points_percent }) : t("No points yet")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="exam-stats__muted">{t("Partly correct answers earn some of the points, but don’t count as correct.")}</p>
    </Block>
  );
}

function WeakestConcepts({ concepts, stats }) {
  const navigate = useNavigate();
  return (
    <Block title={t("Weakest concepts")} className="exam-stats__block--wide">
      {concepts.length === 0 ? (
        <p className="exam-stats__muted">{t("A concept shows here once it was asked in at least 2 questions.")}</p>
      ) : (
        <ol className="exam-stats__concepts" aria-label={t("Concepts, fewest correct answers first")}>
          {concepts.map((concept) => {
            const lectureIds = practiceLectureIds(concept, stats);
            return (
              <li key={concept.concept} className="exam-stats__concept">
                <span className="exam-stats__concept-text">
                  <span className="exam-stats__concept-name">{concept.concept}</span>
                  <span className="exam-stats__concept-score">
                    {correctOfText(concept.correct, concept.questions)}
                    <span aria-hidden="true"> · </span>
                    <strong className={concept.correct_percent < 50 ? "exam-stats__low" : undefined}>{percentText(concept.correct_percent)}</strong>
                  </span>
                </span>
                {lectureIds.length > 0 && (
                  <Button
                    size="sm"
                    icon="graduation"
                    onClick={() => navigate("/workspace/exam", { state: { examPreset: { lectureIds, concept: concept.concept } } })}
                  >
                    {t("Practice this")}
                    <span className="visually-hidden">: {concept.concept}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Block>
  );
}

const resultsPath = (examId) => `/workspace/exam?exam=${encodeURIComponent(examId)}`;

function History({ history }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const captionId = useId();
  const rows = showAll ? history : history.slice(0, HISTORY_ROWS);

  return (
    <Block title={t("History")} className="exam-stats__block--wide">
      <div className="exam-stats__scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className="exam-stats__table">
          <caption id={captionId} className="visually-hidden">
            {t("Your submitted exams, newest first. A row opens the exam’s results.")}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("Date")}</th>
              <th scope="col" className="exam-stats__num">
                {t("Score")}
              </th>
              <th scope="col" className="exam-stats__num">
                {t("Questions")}
              </th>
              <th scope="col">{t("Materials")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((exam) => {
              const materials = (exam.lectures ?? []).map((lecture) => lecture.title).filter(Boolean);
              const date = exam.submitted_at ? formatExamDate(exam.submitted_at) : "";
              return (
                <tr
                  key={exam.exam_id}
                  className="exam-stats__history-row"
                  onClick={(event) => {
                    // The link in the row navigates by itself.
                    if (!event.target.closest("a")) navigate(resultsPath(exam.exam_id));
                  }}
                >
                  <td className="exam-stats__date">
                    <Link to={resultsPath(exam.exam_id)}>
                      {date || exam.title}
                      <span className="visually-hidden"> {t("(open the results)")}</span>
                    </Link>
                  </td>
                  <td className="exam-stats__num">
                    {typeof exam.score_percent === "number" ? (
                      <strong>{percentText(exam.score_percent)}</strong>
                    ) : (
                      <span className="exam-stats__waiting">{t("Waiting for a grade")}</span>
                    )}
                  </td>
                  <td className="exam-stats__num">{exam.question_count}</td>
                  <td className="exam-stats__materials">{materials.length > 0 ? materials.join(", ") : exam.title}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {history.length > HISTORY_ROWS && (
        <Button size="sm" variant="ghost" className="exam-stats__more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? t("Show fewer") : t("Show all {count} exams", { count: history.length })}
        </Button>
      )}
    </Block>
  );
}

function Summary({ stats }) {
  const parts = [examsText(stats.exams_submitted)];
  if (typeof stats.average_percent === "number") parts.push(t("average {percent}%", { percent: stats.average_percent }));
  if (typeof stats.best_percent === "number") parts.push(t("best {percent}%", { percent: stats.best_percent }));
  const waiting = stats.exams_submitted - stats.exams_scored;
  if (waiting === 1) parts.push(t("1 waiting for a grade"));
  else if (waiting > 1) parts.push(t("{count} waiting for a grade", { count: waiting }));
  return (
    <p className="exam-stats__summary" data-testid="exam-summary">
      {parts.join(" · ")}
    </p>
  );
}

function Empty({ range, onAllTime }) {
  if (range !== "all") {
    return (
      <div className="exam-stats__empty">
        <p className="exam-stats__empty-title">{t("No exam submitted in the last 4 weeks")}</p>
        <Button size="sm" onClick={onAllTime}>
          {t("Show all time")}
        </Button>
      </div>
    );
  }
  return (
    <div className="exam-stats__empty">
      <p className="exam-stats__empty-title">{t("No exam submitted yet")}</p>
      <p>{t("Take an exam on your materials: your scores per week, your weakest concepts and your history will show here.")}</p>
      <Link to="/workspace/exam" className="btn btn--secondary btn--sm">
        <Icon name="graduation" />
        {t("Take an exam")}
      </Link>
    </div>
  );
}

export default function ExamPerformance() {
  useI18n(); // re-render in a new interface language
  const [range, setRange] = useState("all");
  const { data, error, loading, hasExams, retry } = useExamStats(range);
  const empty = !loading && !error && data && !data.exams_submitted;

  let body;
  if (loading) {
    body = (
      <p className="exam-stats__state" role="status">
        {t("Loading your exam performance…")}
      </p>
    );
  } else if (error) {
    body = (
      <div className="exam-stats__state exam-stats__state--error" role="alert">
        <p>{error.message || t("Unable to load your exam performance.")}</p>
        <Button size="sm" icon="refresh" onClick={retry}>
          {t("Try again")}
        </Button>
      </div>
    );
  } else if (empty) {
    body = <Empty range={range} onAllTime={() => setRange("all")} />;
  } else if (data) {
    body = (
      <>
        <Summary stats={data} />
        <div className="exam-stats__grid">
          {data.by_week?.length > 0 && <WeeklyChart weeks={data.by_week} />}
          {data.by_lecture?.length > 0 && <ByLecture lectures={data.by_lecture} />}
          {data.by_type?.length > 0 && <ByType types={data.by_type} />}
          {data.weakest_concepts && <WeakestConcepts concepts={data.weakest_concepts} stats={data} />}
          {data.history?.length > 0 && <History history={data.history} />}
        </div>
      </>
    );
  }

  return (
    <section className="card exam-stats" aria-labelledby="exam-performance-title" aria-busy={loading || undefined}>
      <div className="exam-stats__head">
        <div>
          <h2 id="exam-performance-title" className="card__title">
            {t("Exam performance")}
          </h2>
          <p className="card__subtitle">{t("How your submitted exams went, and what to work on next.")}</p>
        </div>
        {(hasExams || range !== "all") && (
          <div className="exam-stats__range" role="group" aria-label={t("Period")}>
            {RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                className="exam-stats__range-option"
                aria-pressed={range === item.value}
                onClick={() => setRange(item.value)}
              >
                {item.label()}
              </button>
            ))}
          </div>
        )}
      </div>
      {body}
    </section>
  );
}
