import { useState } from "react";
import "katex/dist/katex.min.css";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { renderMarkdown } from "../../../services/notebook/markdown.js";
import { choiceLetter, formatPoints, pointsOutOf, verdictOf } from "../examFormat.js";

/*
  Step 3: the checked answers of a submitted exam.

  - The score: a ring with the percentage, "6 of 9 points" and how many answers are correct,
    partly correct and wrong. While answers wait to be graded (questions_ungraded > 0) the
    total and the percentage are unknown (null): it says so and offers "Grade again".
  - One card per question: the verdict, the points out of the maximum, the student's answer
    next to the correct one (the choices picked and the correct choices, or the text and the
    reference solution), the feedback, the points per criterion, a lecturer's correction and
    the pages it was written from, per lecture: "Page 12" ("Open page 12 of …") opens that
    page beside the exam; a source whose lecture was deleted shows the page as plain text.

  Props:
    exam              the submitted exam, with every question's `result`
    onOpenSource(source)   opens { lecture_id, page_number, source_type } in the viewer
    onRegrade()       → Promise; grades the waiting answers and refreshes the exam (rejects
                      with the error to show)
    onNewExam()       a new exam on the same materials
*/
export default function ExamResults({ exam, onOpenSource, onRegrade, onNewExam }) {
  const questions = exam.questions ?? [];
  const counts = { correct: 0, partially_correct: 0, incorrect: 0, waiting: 0 };
  for (const question of questions) {
    const result = question.result;
    if (!result?.graded) counts.waiting += 1;
    else counts[result.verdict === "correct" || result.verdict === "partially_correct" ? result.verdict : "incorrect"] += 1;
  }
  const ungraded = Math.max(exam.questions_ungraded ?? 0, counts.waiting);

  return (
    <>
      <ScoreSummary exam={exam} counts={counts} ungraded={ungraded} onRegrade={onRegrade} onNewExam={onNewExam} />
      <ol className="exam-results" aria-label="Your answers">
        {questions.map((question, index) => (
          <li key={question.id}>
            <ResultCard question={question} number={index + 1} onOpenSource={onOpenSource} />
          </li>
        ))}
      </ol>
    </>
  );
}

function ScoreSummary({ exam, counts, ungraded, onRegrade, onNewExam }) {
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState(null);
  const percent = ungraded > 0 ? null : exam.score_percent;
  const known = percent !== null && percent !== undefined && exam.total_points !== null && exam.total_points !== undefined;
  const ratio = known ? Math.max(0, Math.min(100, percent)) : 0;
  const points = known ? `${formatPoints(exam.total_points)} of ${formatPoints(exam.max_points)} ${exam.max_points === 1 ? "point" : "points"}` : null;

  async function regrade() {
    setRegrading(true);
    setRegradeError(null);
    try {
      await onRegrade();
    } catch (err) {
      setRegradeError(err?.message || "The answers could not be graded.");
    } finally {
      setRegrading(false);
    }
  }

  return (
    <section className="exam-card exam-score" aria-labelledby="exam-score-title">
      <div
        className={`exam-ring ${known ? "" : "exam-ring--unknown"}`}
        style={{ "--exam-score": `${ratio * 3.6}deg` }}
        role="img"
        aria-label={known ? `Score ${percent} %, ${points}` : "Score not known yet"}
      >
        <div className="exam-ring__inner" aria-hidden="true">
          <span className="exam-ring__percent">{known ? `${percent}%` : "–"}</span>
          <span className="exam-ring__points">{known ? points : `of ${formatPoints(exam.max_points)}`}</span>
        </div>
      </div>

      <div className="exam-score__text">
        <h3 id="exam-score-title" className="exam-card__title">
          {ungraded > 0 ? "Some answers are still waiting to be graded" : "Your answers are checked"}
        </h3>
        {!known && (
          <p className="exam-score__total">
            {ungraded === 1 ? "1 answer couldn’t" : `${ungraded} answers couldn’t`} be graded yet, so the total isn’t known. Grade again to try now.
          </p>
        )}
        <ul className="exam-verdicts" aria-label="Answers by verdict">
          <li className="exam-verdict exam-verdict--ok">{counts.correct} correct</li>
          <li className="exam-verdict exam-verdict--part">{counts.partially_correct} partly correct</li>
          <li className="exam-verdict exam-verdict--bad">{counts.incorrect} wrong</li>
          {counts.waiting > 0 && <li className="exam-verdict exam-verdict--wait">{counts.waiting} waiting</li>}
        </ul>
        <div className="exam-score__actions">
          {ungraded > 0 && (
            <Button variant="primary" icon="refresh" onClick={regrade} disabled={regrading}>
              {regrading ? "Grading…" : "Grade again"}
            </Button>
          )}
          <Button variant={ungraded > 0 ? "secondary" : "primary"} onClick={onNewExam}>
            New exam on the same materials
          </Button>
        </div>
        {regrading && (
          <p className="exam-muted exam-small" role="status">
            Grading the waiting answers, a few seconds each…
          </p>
        )}
        {regradeError && (
          <p className="exam-alert" role="alert">
            {regradeError}
          </p>
        )}
      </div>
    </section>
  );
}

function ResultCard({ question, number, onOpenSource }) {
  const result = question.result ?? {};
  const verdict = verdictOf(result);
  const isChoice = question.type === "multiple_choice";
  const headingId = `exam-result-${question.id}`;
  const scores = result.scores ?? [];

  return (
    <article className={`exam-card exam-result exam-result--${verdict.tone}`} aria-labelledby={headingId}>
      <div className="exam-question__meta">
        <span className={`exam-verdict exam-verdict--${verdict.tone}`}>{verdict.label}</span>
        <span className="exam-muted exam-small">
          Question {number} · {pointsOutOf(result.graded ? result.points : null, result.max_points ?? question.points)}
        </span>
        {result.corrected && <span className="exam-tag">Corrected by your lecturer</span>}
      </div>
      <div
        id={headingId}
        role="heading"
        aria-level={3}
        className="exam-question__text exam-result__question exam-md"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(question.question) }}
      />

      <div className="exam-compare">
        <div className="exam-compare__box">
          <h4 className="exam-compare__label">Your answer</h4>
          {!result.answered ? (
            <p className="exam-muted">Not answered</p>
          ) : isChoice ? (
            <ChoiceList question={question} ids={result.selected_choice_ids} correct={result.correct_choice_ids} marked />
          ) : (
            <p className="exam-compare__text">{result.answer_text}</p>
          )}
        </div>
        <div className="exam-compare__box exam-compare__box--correct">
          <h4 className="exam-compare__label">Correct answer</h4>
          {isChoice ? (
            <ChoiceList question={question} ids={result.correct_choice_ids} />
          ) : result.reference_solution ? (
            <div className="exam-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.reference_solution) }} />
          ) : (
            <p className="exam-muted">No reference answer was saved.</p>
          )}
        </div>
      </div>

      {!result.graded && result.answered && <p className="exam-muted exam-small">This answer couldn’t be graded yet. Use “Grade again” above.</p>}

      {result.corrected && (
        <div className="exam-correction">
          <p className="exam-correction__title">
            <Icon name="edit" /> Your lecturer corrected the points
          </p>
          {result.correction_comment && <p>{result.correction_comment}</p>}
        </div>
      )}

      {/* An unanswered question's feedback only repeats the correct answer. */}
      {result.feedback && result.answered && (
        <div className="exam-feedback">
          <h4 className="exam-feedback__label">Feedback</h4>
          <div className="exam-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.feedback) }} />
        </div>
      )}

      {scores.length > 0 && result.answered && (
        <details className="exam-criteria" open={!isChoice}>
          <summary>Points per criterion</summary>
          <ul>
            {scores.map((score) => (
              <li key={score.criterion_id} className="exam-criterion">
                <div className="exam-criterion__head">
                  <span className="exam-criterion__name">{score.description || score.criterion_id}</span>
                  <span className="exam-criterion__points">
                    {formatPoints(score.points)} / {formatPoints(score.max_points)}
                  </span>
                </div>
                {score.justification && <p className="exam-muted exam-small">{score.justification}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Sources sources={result.sources ?? []} onOpenSource={onOpenSource} />
    </article>
  );
}

/* The choices `ids` in the order they were shown, "B · text"; `marked` adds right / wrong. */
function ChoiceList({ question, ids, correct = [], marked = false }) {
  const picked = new Set(ids ?? []);
  const right = new Set(correct ?? []);
  const shown = (question.choices ?? []).map((choice, index) => ({ ...choice, letter: choiceLetter(index) })).filter((choice) => picked.has(choice.id));
  if (shown.length === 0) return <p className="exam-muted">None</p>;
  return (
    <ul className="exam-picks">
      {shown.map((choice) => {
        const ok = right.has(choice.id);
        return (
          <li key={choice.id} className={`exam-pick ${marked ? (ok ? "exam-pick--ok" : "exam-pick--bad") : ""}`}>
            <span className="exam-pick__letter" aria-hidden="true">
              {choice.letter}
            </span>
            <span className="exam-pick__text exam-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(choice.text) }} />
            {marked && (
              <span className="exam-pick__mark">
                <Icon name={ok ? "check" : "close"} />
                <span className="visually-hidden">{ok ? "right" : "wrong"}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/*
  The pages a question was written from, per lecture: "Page 12" opens it beside the exam
  (named "Open page 12 of <lecture>"); a deleted lecture's pages are plain text.
*/
function Sources({ sources, onOpenSource }) {
  const groups = [];
  const seen = new Set();
  for (const source of sources) {
    const key = `${source.lecture_id}-${source.source_type}-${source.page_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let group = groups.find((item) => item.lectureId === source.lecture_id);
    if (!group) {
      group = { lectureId: source.lecture_id, title: source.lecture_title, sources: [] };
      groups.push(group);
    }
    group.sources.push({ ...source, key, location: source.location || `Page ${source.page_number}` });
  }
  if (groups.length === 0) return null;
  return (
    <div className="exam-sources">
      {groups.map((group) => (
        <div key={group.lectureId ?? "deleted"} className="exam-sources__group">
          <span className="exam-sources__doc">{group.lectureId ? `In ${group.title ?? "the lecture"}` : "The lecture was deleted"}</span>
          {/* The row also leaves room for more actions per question. */}
          <ul className="exam-result__actions" aria-label={group.lectureId ? `Pages in ${group.title ?? "the lecture"}` : "Pages of a deleted lecture"}>
            {group.sources.map((source) =>
              group.lectureId ? (
                <li key={source.key}>
                  <button
                    type="button"
                    className="exam-source"
                    title="Open this page beside the exam"
                    aria-label={`Open ${source.location.toLowerCase()}${group.title ? ` of ${group.title}` : ""}`}
                    onClick={() => onOpenSource(source)}
                  >
                    {source.location}
                  </button>
                </li>
              ) : (
                <li key={source.key} className="exam-source exam-source--gone">
                  {source.location}
                </li>
              )
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
