import { useState } from "react";
import { Link } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";

/*
  Centre view: Exam (visual demo only).
  There are no real questions, no grading and no timer. The question and answers are
  neutral placeholders, as in the Figma design. Answers are only kept while the view is open.
*/
const QUESTION_COUNT = 4;
const OPTIONS = ["A", "B", "C", "D"];

export default function ExamPage() {
  const [current, setCurrent] = useState(0); // index of the question shown (0-based)
  const [answers, setAnswers] = useState({}); // { questionIndex: "A" | "B" | ... }
  const [submitted, setSubmitted] = useState(false);

  const questionNumber = current + 1;
  const progress = (questionNumber / QUESTION_COUNT) * 100;
  const isFirst = current === 0;
  const isLast = current === QUESTION_COUNT - 1;

  return (
    <section className="panel center-panel exam" aria-labelledby="exam-title">
      <div className="exam__head">
        <div>
          <h2 id="exam-title" className="exam__title">
            Exam
          </h2>
          <p className="exam__step">
            Question {questionNumber} of {QUESTION_COUNT}
          </p>
        </div>
        <Link to="/workspace" className="btn btn--ghost">
          <Icon name="arrowLeft" />
          Back to notebook
        </Link>
      </div>

      <div className="exam__progress">
        <div
          className="exam__bar"
          role="progressbar"
          aria-label="Exam progress"
          aria-valuemin={1}
          aria-valuemax={QUESTION_COUNT}
          aria-valuenow={questionNumber}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="exam__count">
          {questionNumber} / {QUESTION_COUNT}
        </span>
      </div>

      <div className="exam__body">
        <fieldset className="exam__question">
          <legend className="exam__question-box">
            <span className="exam__question-label">Question {questionNumber}</span>
            <span className="exam__question-text">Your exam question will appear here.</span>
          </legend>

          <div className="exam__options">
            {OPTIONS.map((letter) => (
              <label key={letter} className="exam-option">
                <input
                  type="radio"
                  name={`question-${current}`}
                  value={letter}
                  checked={answers[current] === letter}
                  onChange={() => setAnswers({ ...answers, [current]: letter })}
                />
                <span className="exam-option__letter">{letter}</span>
                <span>Answer option {letter}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {submitted && (
          <p className="exam__notice" role="status">
            Visual demo — answers are not graded or saved.
          </p>
        )}
      </div>

      <div className="exam__footer">
        <Button icon="chevronLeft" disabled={isFirst} onClick={() => setCurrent(current - 1)}>
          Previous
        </Button>
        <div className="exam__footer-right">
          <Button icon="chevronRight" disabled={isLast} onClick={() => setCurrent(current + 1)}>
            Next
          </Button>
          <Button variant="primary" onClick={() => setSubmitted(true)}>
            Submit exam
          </Button>
        </div>
      </div>
    </section>
  );
}
