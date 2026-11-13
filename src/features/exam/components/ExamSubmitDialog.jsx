import Button from "../../../components/ui/Button.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import { isAnswered } from "../../../services/exam/examStorage.js";
import { questionNumbers } from "../examFormat.js";

/*
  Asked before an exam is submitted. It names the questions without an answer ("Questions 2
  and 4 are not answered yet and will get 0 points") and can go to the first of them instead.

  Props: questions, answers, onSubmit(), onAnswer(index) (go to that question), onCancel()
*/
export default function ExamSubmitDialog({ questions, answers, onSubmit, onAnswer, onCancel }) {
  const missing = questions.flatMap((question, index) => (isAnswered(answers[question.id]) ? [] : [index]));
  const total = questions.length;

  return (
    <Modal title="Submit your exam?" width={460} onClose={onCancel}>
      <div className="confirm exam-confirm">
        <div className="confirm__text">
          {missing.length === 0 ? (
            <p>All {total} questions are answered.</p>
          ) : (
            <p className="exam-confirm__missing">
              {missing.length === total
                ? "None of the questions is answered yet, so every one will get 0 points."
                : `${questionNumbers(missing.map((index) => index + 1))} ${missing.length === 1 ? "is" : "are"} not answered yet and will get 0 points.`}
            </p>
          )}
          <p>Your answers are checked right away. After that they can’t be changed.</p>
        </div>
        <div className="confirm__actions">
          {missing.length > 0 ? (
            <Button onClick={() => onAnswer(missing[0])}>{missing.length === 1 ? `Answer question ${missing[0] + 1}` : "Answer them first"}</Button>
          ) : (
            <Button onClick={onCancel}>Keep reviewing</Button>
          )}
          <Button variant="primary" onClick={onSubmit}>
            Submit and check
          </Button>
        </div>
      </div>
    </Modal>
  );
}
