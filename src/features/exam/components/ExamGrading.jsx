import { useI18n } from "../../../i18n/i18n.js";
import { isAnswered } from "../../../services/exam/examStorage.js";

/*
  Shown while a submitted exam is graded (the submit request answers once every answer is
  checked): multiple choice at once, each short answer by the LLM in a few seconds.

  Props: questions, answers (what was submitted)
*/
export default function ExamGrading({ questions, answers }) {
  const { t } = useI18n();
  const short = questions.filter((question) => question.type === "short_answer" && isAnswered(answers[question.id])).length;
  return (
    <section className="exam-card exam-card--center" aria-labelledby="exam-grading-title" aria-busy="true">
      <h3 id="exam-grading-title" className="exam-card__title">
        {t("Checking your answers…")}
      </h3>
      <div className="exam-bar exam-bar--wide exam-bar--busy exam-bar--sweep" aria-hidden="true">
        <span />
      </div>
      <p className="exam-muted" role="status">
        {short === 0
          ? t("This takes only a moment.")
          : short === 1
            ? t("Your short answer is graded against the lecture, a few seconds each.")
            : t("Your {count} short answers are graded against the lecture, a few seconds each.", { count: short })}
      </p>
    </section>
  );
}
