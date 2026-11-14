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
  Step 2: answering a ready exam, one question at a time.

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

  Render it with key={exam.id}: the saved answers are read once, when it mounts.

  Props: exam (with questions), userKey, sourceType(lectureId) → "page" | "slide" | "cell",
         onSubmit(answers) → Promise (rejects with the ApiError to show), grading
*/
export default function ExamQuestions({ exam, userKey, sourceType = () => "page", onSubmit = null, grading = false }) {
  const { t } = useI18n();
  const questions = exam.questions;
  const total = questions.length;
  const [progress, setProgress] = useState(() => loadExamProgress(userKey, exam.id));
  const [reviewing, setReviewing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const headingRef = useRef(null);
  const moved = useRef(false);

  const index = Math.min(progress.current, total - 1);
  const question = questions[index];
  const answers = progress.answers;
  const answered = countAnswered(answers, questions);

  // After Previous / Next / a jump, move the focus to the new question.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    (reviewing ? document.getElementById("exam-review-title") : headingRef.current)?.focus();
  }, [index, reviewing]);

  // Every change is saved at once (one change per event, so `progress` is current).
  function update(changes) {
    const next = { ...progress, ...changes };
    setProgress(next);
    setSaveFailed(!saveExamProgress(userKey, exam.id, next));
  }

  function go(next) {
    moved.current = true;
    setReviewing(false);
    update({ current: Math.max(0, Math.min(total - 1, next)) });
  }

  function setAnswer(value) {
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

  const lectureTitle = exam.lectures?.find((item) => item.lecture_id && item.lecture_id === question.lecture_id)?.title;
  const pages = pagesLabel(question.source_pages, sourceType(question.lecture_id));
  const source = [lectureTitle, pages].filter(Boolean).join(", ");
  const isChoice = question.type === "multiple_choice" && Array.isArray(question.choices);
  const chosen = Array.isArray(answers[question.id]) ? answers[question.id] : [];
  const text = typeof answers[question.id] === "string" ? answers[question.id] : "";
  const headingId = `exam-q-${question.id}`;

  return (
    <>
      <div className="exam-progress">
        <div className="exam-bar" role="progressbar" aria-label={t("Questions answered")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
          <span style={{ width: `${Math.round((answered / total) * 100)}%` }} />
        </div>
        <span className="exam-muted exam-small">
          {t("{answered} of {total} answered", { answered, total })}
        </span>
      </div>

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
        </ol>
      </nav>

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
                    <label key={choice.id} className={`exam-choice ${on ? "exam-choice--on" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleChoice(choice.id)} />
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
                  onChange={(event) => setAnswer(event.target.value.slice(0, MAX_ANSWER_LENGTH))}
                />
                <div className="exam-short__foot exam-muted exam-small">
                  <span>{t("Your answer is saved on this device.")}</span>
                  <span aria-live={text.length >= MAX_ANSWER_LENGTH ? "polite" : "off"}>
                    {text.length} / {MAX_ANSWER_LENGTH}
                  </span>
                </div>
              </div>
            )}
          </section>

          <div className="exam-nav">
            <Button icon="chevronLeft" disabled={index === 0} onClick={() => go(index - 1)}>
              {t("Previous")}
            </Button>
            {index < total - 1 ? (
              <Button variant="primary" onClick={() => go(index + 1)}>
                {t("Next")}
                <Icon name="chevronRight" />
              </Button>
            ) : (
              <Button variant="primary" onClick={finish}>
                {t("Finish")}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  );
}
