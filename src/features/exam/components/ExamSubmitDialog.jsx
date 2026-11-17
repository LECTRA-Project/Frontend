import Button from "../../../components/ui/Button.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { isAnswered } from "../../../services/exam/examStorage.js";

/*
  Asked before an exam is submitted. It names the questions without an answer ("Questions 2
  and 4 are not answered yet and will get 0 points") and can go to the first of them instead.
  It also names the questions flagged for review; when every question is answered, it can go
  to the first flagged one instead.

  Props: questions, answers, flagged [question id], onSubmit(), onAnswer(index) (go to that
         question), onCancel()
*/
export default function ExamSubmitDialog({ questions, answers, flagged = [], onSubmit, onAnswer, onCancel }) {
  const { t } = useI18n();
  const missing = questions.flatMap((question, index) => (isAnswered(answers[question.id]) ? [] : [index]));
  const marked = questions.flatMap((question, index) => (flagged.includes(question.id) ? [index] : []));
  const total = questions.length;
  const numbers = (indexes) => ({ list: indexes.slice(0, -1).map((index) => index + 1).join(", "), last: indexes.at(-1) + 1 });

  return (
    <Modal title={t("Submit your exam?")} width={460} onClose={onCancel}>
      <div className="confirm exam-confirm">
        <div className="confirm__text">
          {missing.length === 0 ? (
            <p>{t("All {total} questions are answered.", { total })}</p>
          ) : (
            <p className="exam-confirm__missing">
              {missing.length === total
                ? t("None of the questions is answered yet, so every one will get 0 points.")
                : missing.length === 1
                  ? t("Question {number} is not answered yet and will get 0 points.", { number: missing[0] + 1 })
                  : t("Questions {list} and {last} are not answered yet and will get 0 points.", {
                      list: missing
                        .slice(0, -1)
                        .map((index) => index + 1)
                        .join(", "),
                      last: missing.at(-1) + 1,
                    })}
            </p>
          )}
          {marked.length > 0 && (
            <p className="exam-confirm__flagged">
              {marked.length === 1
                ? t("Question {number} is flagged for review.", { number: marked[0] + 1 })
                : t("Questions {list} and {last} are flagged for review.", numbers(marked))}
            </p>
          )}
          <p>{t("Your answers are checked right away. After that they can’t be changed.")}</p>
        </div>
        <div className="confirm__actions">
          {missing.length > 0 ? (
            <Button onClick={() => onAnswer(missing[0])}>{missing.length === 1 ? t("Answer question {number}", { number: missing[0] + 1 }) : t("Answer them first")}</Button>
          ) : marked.length > 0 ? (
            <Button onClick={() => onAnswer(marked[0])}>{t("Go to question {number}", { number: marked[0] + 1 })}</Button>
          ) : (
            <Button onClick={onCancel}>{t("Keep reviewing")}</Button>
          )}
          <Button variant="primary" onClick={onSubmit}>
            {t("Submit and check")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
