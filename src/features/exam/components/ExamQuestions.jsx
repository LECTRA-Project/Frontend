import { useEffect, useRef, useState } from "react";
import "katex/dist/katex.min.css";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { MAX_ANSWER_LENGTH } from "../../../api/services/exams.js";
import { countAnswered, isAnswered, loadExamProgress, saveExamProgress } from "../../../services/exam/examStorage.js";
import { renderMarkdown } from "../../../services/notebook/markdown.js";
import { choiceLetter, pagesLabel, pointsLabel } from "../examFormat.js";
import ExamGrading from "./ExamGrading.jsx";
import ExamReview from "./ExamReview.jsx";
import ExamSubmitDialog from "./ExamSubmitDialog.jsx";

/*
  Step 2: answering the exam, one question at a time.

  - Multiple choice: any number of choices may be selected (each choice is graded), so they
    are checkboxes under "Select every correct answer".
  - Short answer: a text box of at most MAX_ANSWER_LENGTH characters.
  - Previous / Next, a question map (answered or not, click to jump) and "3 of 5 answered".
  - Every change is saved on this device (examStorage), per user and exam, with the question
    on screen; a reload or coming back later restores both.
  - Finish (on the last question) opens the review: every question answered or not, and a
    click jumps to it. With `onSubmit`, the review has "Submit and check": a confirmation
    names the questions without an answer (and can go to them), then onSubmit(answers)
    hands them in. While `grading`, "Checking your answers…" is shown instead; when
    onSubmit rejects, the review shows the error.

  While the questions are still written (status "generating", the student chose "Start with
  the first questions"):
  - the questions written so far can be answered; the others are in the map as "being
    written" (not clickable) and come in as the page polls the exam;
  - each new question is announced politely ("Question 3 is ready"), without moving focus;
  - Next on the last written question goes to a "Question 4 is being written…" card that
    turns into the question when it arrives;
  - Finish (so the review and "Submit and check") stays disabled until the exam is ready,
    with a note why ("2 questions are still being written").
  Once ready with fewer questions than asked (the backend keeps an exam with at least 3),
  a notice says so. A failed exam (status "failed") keeps the answers visible, read-only,
  under `banner` (the error with Retry, from the page).

  Render it with key={exam.id}: the saved answers are read once, when it mounts, and the
  component stays mounted while the exam goes from generating to ready (so focus and the
  text being typed are kept).

  Props: exam (with questions), userKey, sourceType(lectureId) → "page" | "slide" | "cell",
         onSubmit(answers) → Promise (rejects with the ApiError to show), grading,
         banner (shown on top), loadError (a failed read while polling) with onReload,
         focusOnStart (move the focus to the question when it mounts)
*/
export default function ExamQuestions({
  exam,
  userKey,
  sourceType = () => "page",
  onSubmit = null,
  grading = false,
  banner = null,
  loadError = null,
  onReload = null,
  focusOnStart = false,
}) {
  const { t } = useI18n();
  const questions = exam.questions ?? [];
  const written = questions.length;
  const generating = exam.status === "generating";
  const readOnly = exam.status === "failed";
  // While generating, the questions not written yet; once ready, those that couldn't be.
  const expected = generating ? Math.max(exam.question_count ?? written, written) : written;
  const pending = expected - written;
  const fewer = exam.status === "ready" && exam.question_count > written ? exam.question_count - written : 0;
  const total = expected; // "Question 2 of 5" counts the questions still being written
  const [progress, setProgress] = useState(() => loadExamProgress(userKey, exam.id));
  const [reviewing, setReviewing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const headingRef = useRef(null);
  const moved = useRef(focusOnStart);
  const wasWaiting = useRef(false);

  // While questions are still written, one step past the last one: the question being written.
  const last = pending > 0 ? written : written - 1;
  const index = Math.max(0, Math.min(progress.current, last));
  const waiting = index >= written;
  const question = waiting ? null : questions[index];
  const answers = progress.answers;
  const answered = countAnswered(answers, questions);

  // Announced politely as questions arrive (and when the exam is ready), never moving focus.
  const [heard, setHeard] = useState({ written, status: exam.status, text: "" });
  if (heard.written !== written || heard.status !== exam.status) {
    const parts = [];
    if (written > heard.written) {
      const numbers = Array.from({ length: written - heard.written }, (_, offset) => heard.written + offset + 1);
      parts.push(
        numbers.length === 1
          ? t("Question {number} is ready.", { number: numbers[0] })
          : t("Questions {list} and {last} are ready.", { list: numbers.slice(0, -1).join(", "), last: numbers.at(-1) })
      );
    }
    if (heard.status === "generating" && exam.status === "ready") {
      parts.push(
        fewer > 0
          ? t("All questions are written: this exam has {count} instead of {asked}. You can finish it now.", { count: written, asked: exam.question_count })
          : t("All questions are ready. You can finish the exam now.")
      );
    }
    setHeard({ written, status: exam.status, text: parts.length > 0 ? parts.join(" ") : heard.text });
  }

  // After Previous / Next / a jump (or the start), move the focus to the new question.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (reviewing ? document.getElementById("exam-review-title") : headingRef.current)?.focus();
  }, [index, reviewing]);

  // The "being written" card was replaced by the question (or the exam ended with fewer):
  // if its focus was lost with it, give it to the question now on screen.
  useEffect(() => {
    if (wasWaiting.current && !waiting && (document.activeElement === document.body || !document.activeElement)) {
      // Like a move by Next: no focus ring on the heading (the browser would show one here).
      headingRef.current?.focus({ focusVisible: false });
    }
    wasWaiting.current = waiting;
  }, [waiting]);

  // Every change is saved at once (one change per event, so `progress` is current).
  function update(changes) {
    const next = { ...progress, ...changes };
    setProgress(next);
    setSaveFailed(!saveExamProgress(userKey, exam.id, next));
  }

  function go(next) {
    moved.current = true;
    setReviewing(false);
    update({ current: Math.max(0, Math.min(last, next)) });
  }

  function setAnswer(value) {
    if (readOnly || !question) return;
    update({ answers: { ...answers, [question.id]: value } });
  }

  function toggleChoice(id) {
    const chosen = Array.isArray(answers[question.id]) ? answers[question.id] : [];
    const next = chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id];
    // Kept in the order the choices are shown.
    setAnswer(question.choices.map((choice) => choice.id).filter((item) => next.includes(item)));
  }

  function finish() {
    moved.current = true;
    setReviewing(true);
  }

  async function submit() {
    setConfirming(false);
    setSubmitError(null);
    try {
      await onSubmit(answers);
    } catch (err) {
      setSubmitError(err?.message || t("The exam could not be submitted."));
    }
  }

  if (grading) return <ExamGrading questions={questions} answers={answers} />;

  const lectureTitle = question && exam.lectures?.find((item) => item.lecture_id && item.lecture_id === question.lecture_id)?.title;
  const pages = question ? pagesLabel(question.source_pages, sourceType(question.lecture_id)) : "";
  const source = [lectureTitle, pages].filter(Boolean).join(", ");
  const isChoice = question?.type === "multiple_choice" && Array.isArray(question.choices);
  const chosen = question && Array.isArray(answers[question.id]) ? answers[question.id] : [];
  const text = question && typeof answers[question.id] === "string" ? answers[question.id] : "";
  const headingId = question ? `exam-q-${question.id}` : "exam-q-waiting";
  // On the last question: Finish (disabled until the exam is ready).
  const atEnd = index >= expected - 1;

  return (
    <>
      {banner}

      <div className="exam-progress">
        <div className="exam-bar" role="progressbar" aria-label={t("Questions answered")} aria-valuemin={0} aria-valuemax={written} aria-valuenow={answered}>
          <span style={{ width: `${Math.round((answered / written) * 100)}%` }} />
        </div>
        <span className="exam-muted exam-small">
          {t("{answered} of {total} answered", { answered, total: written })}
        </span>
      </div>
      {generating && (
        <p className="exam-writing exam-muted exam-small">
          <span className="exam-writing__dot" aria-hidden="true" />
          {t("{ready} of {total} questions ready", { ready: written, total: expected })}
        </p>
      )}
      {fewer > 0 && (
        <p className="exam-notice">
          {fewer === 1
            ? t("This exam has {count} questions instead of {asked}: 1 question couldn’t be written.", { count: written, asked: exam.question_count })
            : t("This exam has {count} questions instead of {asked}: {missing} questions couldn’t be written.", {
                count: written,
                asked: exam.question_count,
                missing: fewer,
              })}
        </p>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {heard.text}
      </p>

      <nav aria-label={t("Questions")}>
        <ol className="exam-map">
          {questions.map((item, position) => {
            const done = isAnswered(answers[item.id]);
            const here = !reviewing && position === index;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`exam-map__item ${done ? "exam-map__item--done" : ""} ${here ? "exam-map__item--current" : ""}`}
                  aria-label={done ? t("Question {number}, answered", { number: position + 1 }) : t("Question {number}, not answered", { number: position + 1 })}
                  aria-current={here ? "step" : undefined}
                  onClick={() => go(position)}
                >
                  {position + 1}
                </button>
              </li>
            );
          })}
          {Array.from({ length: pending }, (_, offset) => {
            const number = written + offset + 1;
            const here = !reviewing && waiting && offset === 0;
            return (
              <li key={`writing-${number}`}>
                {/* Not clickable until it is written; the label says why. */}
                <button
                  type="button"
                  className={`exam-map__item exam-map__item--writing ${here ? "exam-map__item--current" : ""}`}
                  aria-label={t("Question {number}, being written", { number })}
                  aria-current={here ? "step" : undefined}
                  title={t("Being written")}
                  disabled
                >
                  <span aria-hidden="true">{number}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {loadError && generating && (
        <div className="exam-alert" role="alert">
          <p>{loadError.message || t("The exam could not be loaded.")}</p>
          {onReload && (
            <Button size="sm" onClick={onReload}>
              {t("Try again")}
            </Button>
          )}
        </div>
      )}

      {saveFailed && (
        <p className="exam-warning" role="alert">
          <Icon name="alert" /> {t("Your answers can’t be saved on this device (browser storage is unavailable or full). Keep this page open.")}
        </p>
      )}

      {reviewing ? (
        <>
          <ExamReview questions={questions} answers={answers} onJump={go} onBack={() => go(index)}>
            {onSubmit && (
              <Button
                variant="primary"
                icon="check"
                onClick={() => {
                  setSubmitError(null);
                  setConfirming(true);
                }}
              >
                {t("Submit and check")}
              </Button>
            )}
          </ExamReview>
          {submitError && (
            <p className="exam-alert" role="alert">
              {submitError}
            </p>
          )}
          {confirming && (
            <ExamSubmitDialog
              questions={questions}
              answers={answers}
              onSubmit={submit}
              onAnswer={(position) => {
                setConfirming(false);
                go(position);
              }}
              onCancel={() => setConfirming(false)}
            />
          )}
        </>
      ) : waiting ? (
        <section className="exam-card exam-question exam-question--waiting" aria-labelledby={headingId}>
          <div className="exam-question__meta">
            <span className="exam-muted exam-small">{t("Question {number} of {total}", { number: index + 1, total })}</span>
          </div>
          <h3 id={headingId} ref={headingRef} tabIndex={-1} className="exam-question__text">
            {t("Question {number} is being written…", { number: index + 1 })}
          </h3>
          <div className="exam-bar exam-bar--wide exam-bar--busy" aria-hidden="true">
            <span style={{ width: "0%" }} />
          </div>
          <p className="exam-muted">{t("It shows here as soon as it’s ready. Your answers so far are saved.")}</p>
        </section>
      ) : (
        <>
          <section className="exam-card exam-question" aria-labelledby={headingId}>
            <div className="exam-question__meta">
              <span className="exam-tag">{isChoice ? t("Multiple choice") : t("Short answer")}</span>
              <span className="exam-muted exam-small">
                {source
                  ? t("Question {number} of {total} · {points} · from {source}", { number: index + 1, total, points: pointsLabel(question.points), source })
                  : t("Question {number} of {total} · {points}", { number: index + 1, total, points: pointsLabel(question.points) })}
              </span>
            </div>
            {/* The question is Markdown (paragraphs, code, math), so a heading role on a block. */}
            <div
              id={headingId}
              ref={headingRef}
              role="heading"
              aria-level={3}
              tabIndex={-1}
              className="exam-question__text exam-md"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(question.question) }}
            />

            {isChoice ? (
              <fieldset className="exam-choices" aria-labelledby={`${headingId} ${headingId}-hint`}>
                <p id={`${headingId}-hint`} className="exam-hint">
                  {t("Select every correct answer")}
                </p>
                {question.choices.map((choice, position) => {
                  const on = chosen.includes(choice.id);
                  return (
                    <label key={choice.id} className={`exam-choice ${on ? "exam-choice--on" : ""} ${readOnly ? "exam-choice--locked" : ""}`}>
                      <input type="checkbox" checked={on} disabled={readOnly} onChange={() => toggleChoice(choice.id)} />
                      <span className="exam-choice__letter" aria-hidden="true">
                        {choiceLetter(position)}
                      </span>
                      <span className="exam-choice__text exam-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(choice.text) }} />
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <div className="exam-short">
                <label htmlFor={`${headingId}-answer`} className="exam-hint">
                  {t("Your answer")}
                </label>
                <textarea
                  id={`${headingId}-answer`}
                  className="exam-short__input"
                  rows={6}
                  maxLength={MAX_ANSWER_LENGTH}
                  placeholder={t("Write your answer in your own words…")}
                  value={text}
                  readOnly={readOnly}
                  onChange={(event) => setAnswer(event.target.value.slice(0, MAX_ANSWER_LENGTH))}
                />
                <div className="exam-short__foot exam-muted exam-small">
                  <span>{readOnly ? t("This exam can’t be submitted, so the answer can’t be changed.") : t("Your answer is saved on this device.")}</span>
                  <span aria-live={text.length >= MAX_ANSWER_LENGTH ? "polite" : "off"}>
                    {text.length} / {MAX_ANSWER_LENGTH}
                  </span>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {!reviewing && (
        <>
          <div className="exam-nav">
            <Button icon="chevronLeft" disabled={index === 0} onClick={() => go(index - 1)}>
              {t("Previous")}
            </Button>
            {!atEnd ? (
              // While generating, Next on the last written question goes to the one being written.
              <Button variant="primary" disabled={waiting} onClick={() => go(index + 1)}>
                {t("Next")}
                <Icon name="chevronRight" />
              </Button>
            ) : readOnly ? null : (
              <Button variant="primary" disabled={generating} aria-describedby={generating ? "exam-finish-note" : undefined} onClick={finish}>
                {t("Finish")}
              </Button>
            )}
          </div>
          {generating && (
            <p id="exam-finish-note" className="exam-nav__note exam-muted exam-small">
              {pending === 0
                ? t("The exam is almost ready. You can finish it in a moment.")
                : pending === 1
                  ? t("1 question is still being written. You can finish once it’s ready.")
                  : t("{count} questions are still being written. You can finish once they’re ready.", { count: pending })}
            </p>
          )}
        </>
      )}
    </>
  );
}
