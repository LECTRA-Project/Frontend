import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { isAnswered } from "../../../services/exam/examStorage.js";
import { plainText } from "../examFormat.js";

/*
  The overview opened by Finish: every question, answered or not; a click jumps to it.

  Props: questions, answers, onJump(index), onBack()
         children   more actions for the reviewed exam, shown beside "Back to the questions"
*/
export default function ExamReview({ questions, answers, onJump, onBack, children = null }) {
  const { t } = useI18n();
  const missing = questions.filter((question) => !isAnswered(answers[question.id])).length;
  const total = questions.length;

  return (
    <section className="exam-card exam-review" aria-labelledby="exam-review-title">
      <div>
        <h3 id="exam-review-title" className="exam-card__title" tabIndex={-1}>
          {t("Review your answers")}
        </h3>
        <p className="exam-card__lead">
          {missing === 0
            ? t("All {total} questions are answered.", { total })
            : missing === 1
              ? t("{answered} of {total} answered · 1 question isn’t answered yet.", { answered: total - missing, total })
              : t("{answered} of {total} answered · {missing} questions aren’t answered yet.", { answered: total - missing, total, missing })}
        </p>
      </div>

      <ol className="exam-review__list">
        {questions.map((question, index) => {
          const done = isAnswered(answers[question.id]);
          return (
            <li key={question.id}>
              <button type="button" className="exam-review__item" onClick={() => onJump(index)}>
                <span className={`exam-review__number ${done ? "exam-review__number--done" : ""}`}>{index + 1}</span>
                <span className="exam-review__text">{plainText(question.question)}</span>
                <span className={`exam-status ${done ? "exam-status--done" : ""}`}>
                  {done && <Icon name="check" />}
                  {done ? t("Answered") : t("Not answered")}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="exam-actions">
        <Button icon="chevronLeft" onClick={onBack}>
          {t("Back to the questions")}
        </Button>
        {children}
      </div>
    </section>
  );
}
