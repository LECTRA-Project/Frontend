import Button from "../../../components/ui/Button.jsx";
import { useI18n } from "../../../i18n/i18n.js";

/*
  Step 1, while the questions are written: "2 of 5 questions ready" with a progress bar.
  The page reads the exam again every 2 s (useExam) and shows the questions once it is ready.
  As soon as the first question is written, "Start with the first questions" (onStart) lets
  the student answer while the others are written.
  With `failed`, the exam's error with Retry (the same settings) and Back. `answered`: the
  student had started answering (the answers stay below, read-only), so the card says so.

  Props: exam, onRetry, onBack, retrying, retryError { message, busyId }, onOpenExam(id),
         loadError (a failed read while polling) with onReload, onStart, answered
*/
export default function ExamGenerating({ exam, onRetry, onBack, retrying, retryError, onOpenExam, loadError, onReload, onStart = null, answered = false }) {
  const { t } = useI18n();
  if (exam.status === "failed") {
    return (
      <section className="exam-card exam-card--center" aria-labelledby="exam-failed-title">
        <h3 id="exam-failed-title" className="exam-card__title">
          {t("The exam couldn’t be generated")}
        </h3>
        <p className="exam-error" role="alert">
          {exam.error || t("Something went wrong while writing the questions.")}
        </p>
        {answered && (
          <p className="exam-muted exam-small">
            {t("It can’t be submitted, so your answers below are kept read-only. Retry starts a new exam with the same settings.")}
          </p>
        )}
        <div className="exam-actions">
          <Button variant="primary" icon="refresh" onClick={onRetry} disabled={retrying}>
            {retrying ? t("Starting…") : t("Retry")}
          </Button>
          <Button icon="arrowLeft" onClick={onBack}>
            {t("Back")}
          </Button>
        </div>
        {retryError && (
          <div className="exam-alert" role="alert">
            <p>{retryError.message}</p>
            {retryError.busyId && (
              <Button size="sm" onClick={() => onOpenExam(retryError.busyId)}>
                {t("Open that exam")}
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }

  const total = exam.question_count || 1;
  const ready = Math.min(exam.questions_ready ?? 0, total);
  const canStart = Boolean(onStart) && (exam.questions?.length ?? 0) > 0;
  return (
    <section className="exam-card exam-card--center" aria-labelledby="exam-generating-title">
      <h3 id="exam-generating-title" className="exam-card__title">
        {t("Writing your questions…")}
      </h3>
      <p className="exam-muted" role="status" aria-live="polite">
        {t("{ready} of {total} questions ready", { ready, total })}
      </p>
      <div className="exam-bar exam-bar--wide exam-bar--busy" role="progressbar" aria-label={t("Questions ready")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={ready}>
        <span style={{ width: `${Math.round((ready / total) * 100)}%` }} />
      </div>
      {canStart && (
        <div className="exam-early">
          <Button variant="primary" className="exam-btn-lg" icon="play" onClick={onStart}>
            {t("Start with the first questions")}
          </Button>
          <p className="exam-muted exam-small">{t("The others appear while you answer. You can submit once all of them are ready.")}</p>
        </div>
      )}
      <p className="exam-muted exam-small">{t("You can leave this page: the exam waits for you under “Continue an exam”.")}</p>
      {loadError && (
        <div className="exam-alert" role="alert">
          <p>{loadError.message || t("The exam could not be loaded.")}</p>
          <Button size="sm" onClick={onReload}>
            {t("Try again")}
          </Button>
        </div>
      )}
    </section>
  );
}
