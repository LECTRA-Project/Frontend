import Button from "../../../components/ui/Button.jsx";

/*
  Step 1, while the questions are written: "2 of 5 questions ready" with a progress bar.
  The page reads the exam again every 2 s (useExam) and shows the questions once it is ready.
  With `failed`, the exam's error with Retry (the same settings) and Back.

  Props: exam, onRetry, onBack, retrying, retryError { message, busyId }, onOpenExam(id),
         loadError (a failed read while polling) with onReload
*/
export default function ExamGenerating({ exam, onRetry, onBack, retrying, retryError, onOpenExam, loadError, onReload }) {
  if (exam.status === "failed") {
    return (
      <section className="exam-card exam-card--center" aria-labelledby="exam-failed-title">
        <h3 id="exam-failed-title" className="exam-card__title">
          The exam couldn’t be generated
        </h3>
        <p className="exam-error" role="alert">
          {exam.error || "Something went wrong while writing the questions."}
        </p>
        <div className="exam-actions">
          <Button variant="primary" icon="refresh" onClick={onRetry} disabled={retrying}>
            {retrying ? "Starting…" : "Retry"}
          </Button>
          <Button icon="arrowLeft" onClick={onBack}>
            Back
          </Button>
        </div>
        {retryError && (
          <div className="exam-alert" role="alert">
            <p>{retryError.message}</p>
            {retryError.busyId && (
              <Button size="sm" onClick={() => onOpenExam(retryError.busyId)}>
                Open that exam
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }

  const total = exam.question_count || 1;
  const ready = Math.min(exam.questions_ready ?? 0, total);
  return (
    <section className="exam-card exam-card--center" aria-labelledby="exam-generating-title">
      <h3 id="exam-generating-title" className="exam-card__title">
        Writing your questions…
      </h3>
      <p className="exam-muted" role="status" aria-live="polite">
        {ready} of {total} questions ready
      </p>
      <div className="exam-bar exam-bar--wide exam-bar--busy" role="progressbar" aria-label="Questions ready" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ready}>
        <span style={{ width: `${Math.round((ready / total) * 100)}%` }} />
      </div>
      <p className="exam-muted exam-small">You can leave this page: the exam waits for you under “Continue an exam”.</p>
      {loadError && (
        <div className="exam-alert" role="alert">
          <p>{loadError.message || "The exam could not be loaded."}</p>
          <Button size="sm" onClick={onReload}>
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}
