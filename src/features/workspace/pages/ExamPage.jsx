import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { t as translateNow, useI18n } from "../../../i18n/i18n.js";
import { deleteExam, getExam, listAllExams, QUESTION_TYPES, regradeExam, startExam, submitExam } from "../../../api/services/exams.js";
import { clearExamProgress, loadExamProgress, saveExamProgress, updateExamProgress } from "../../../services/exam/examStorage.js";
import { toMaterial } from "../../lectures/materialTypes.js";
import ExamSetup from "../../exam/components/ExamSetup.jsx";
import ExamGenerating from "../../exam/components/ExamGenerating.jsx";
import ExamQuestions from "../../exam/components/ExamQuestions.jsx";
import ExamResults from "../../exam/components/ExamResults.jsx";
import { useExam } from "../../exam/useExam.js";
import { useUnfinishedExams } from "../../exam/useUnfinishedExams.js";
import "../../exam/exam.css";

/*
  Centre view at /workspace/exam: an exam generated from the student's materials.

    no ?exam=          Step 1, set up (or continue an unfinished exam)       ExamSetup
    ?exam=<id>         generating: "2 of 5 questions ready" (polled), failed: Retry / Back
                                                                             ExamGenerating
                       ready: Step 2, the questions; Finish opens the review  ExamQuestions
                       "Submit and check" (after a confirmation): "Checking your answers…"
                       while the backend grades, then the results
                       submitted: Step 3, the checked answers                 ExamResults

  The exam id is in the URL next to the workspace's ?chat= / ?lecture=, so a reload or a
  shared link opens the same exam, and "Back to chat" returns to the same chat. Answers are
  kept on this device (services/exam/examStorage.js) until the exam is submitted.

  The data it needs from WorkspaceLayout comes through the Outlet context (`examView`):
  userKey, the open chat's lectures, the library and whether they are still loading,
  onOpenSource to open a question's page in the viewer beside the exam, and onAskAbout for
  "Ask about this" on a checked answer (it opens a chat, see WorkspaceLayout).

  "New exam on the same materials" opens the setup with that exam's lectures, number and
  types chosen (kept in the history entry's state, so a reload keeps them too).
*/
function stepLabel(step, t) {
  return {
    setup: t("Step 1 of 3 · Set up"),
    generating: t("Step 1 of 3 · Generating"),
    failed: t("Step 1 of 3 · Generating"),
    ready: t("Step 2 of 3 · Answer"),
    grading: t("Step 3 of 3 · Checking"),
    submitted: t("Step 3 of 3 · Results"),
  }[step];
}

// Lectures without readable text yet: the backend can't write questions from them (422).
function notReadyReason(status, t) {
  return {
    uploading: t("Still uploading"),
    processing: t("Still processing, not ready for an exam yet"),
    failed: t("Processing failed, so no questions can be made from it"),
    skipped: t("No readable text (images can’t be used for exams)"),
  }[status];
}

function toExamMaterial(lecture) {
  const material = toMaterial(lecture);
  const reason = notReadyReason(material.status, translateNow) ?? null;
  return { id: lecture.id, title: lecture.title, meta: material.meta, selectable: !reason, reason };
}

export default function ExamPage() {
  const { t } = useI18n();
  const { examView } = useOutletContext();
  const { userKey, chatLectures, library, loading: materialsLoading, sourceType, onOpenSource, onAskAbout } = examView;
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const examId = params.get("exam");

  const examState = useExam(examId);
  const { exam } = examState;
  const unfinished = useUnfinishedExams();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null); // { message, busyId }
  const [notice, setNotice] = useState(null);
  const [grading, setGrading] = useState(false);
  // { lectureIds, questionCount, types } for "New exam on the same materials".
  const [preset, setPreset] = useState(() => location.state?.examPreset ?? null);

  /* ---------- URL ---------- */
  const searchWith = (id) => {
    const next = new URLSearchParams(location.search);
    if (id) next.set("exam", id);
    else next.delete("exam");
    const search = next.toString();
    return search ? `?${search}` : "";
  };
  const backToChat = { pathname: "/workspace", search: searchWith(null) };

  function openExam(id, { replace = false } = {}) {
    setStartError(null);
    setNotice(null);
    setPreset(null);
    navigate({ pathname: location.pathname, search: searchWith(id) }, { replace });
  }

  function toSetup({ replace = false, examPreset = null } = {}) {
    setStartError(null);
    setPreset(examPreset);
    unfinished.reload();
    navigate({ pathname: location.pathname, search: searchWith(null) }, { replace, state: examPreset ? { examPreset } : null });
  }

  // A link to an exam that isn't the student's (or no longer exists): say so, show the setup.
  const missing = examState.error?.status === 404 || examState.error?.status === 422;
  useEffect(() => {
    if (!examId || !missing) return;
    setNotice(t("That exam isn’t in your exams. It may have been discarded."));
    navigate({ pathname: location.pathname, search: searchWith(null) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, missing]);

  /* ---------- Starting ---------- */
  async function start(settings) {
    setStarting(true);
    setStartError(null);
    setNotice(null);
    try {
      const created = await startExam(settings);
      // How it was started, so Retry can use the same settings.
      updateExamProgress(userKey, created.id, { settings });
      examState.seed(created);
      openExam(created.id);
      return created;
    } catch (err) {
      let busyId = null;
      if (err?.status === 409) {
        // The exam being generated, so it can be opened from here.
        try {
          busyId = (await listAllExams()).find((item) => item.status === "generating")?.id ?? null;
        } catch {
          busyId = null;
        }
      }
      setStartError({ message: err.message || t("The exam could not be started."), busyId });
      return null;
    } finally {
      setStarting(false);
    }
  }

  // Retry a failed exam with the settings it was started with (from this device, else from
  // the exam itself: its materials, its size and both question types). The failed exam
  // has nothing to keep, so it is discarded once the new one has started.
  async function retry() {
    const failed = exam;
    const saved = loadExamProgress(userKey, failed.id).settings;
    const settings = saved ?? {
      lectureIds: (failed.lectures ?? []).map((item) => item.lecture_id).filter(Boolean),
      questionCount: failed.question_count,
      types: QUESTION_TYPES.map((type) => type.value),
    };
    const created = await start(settings);
    if (!created) return;
    clearExamProgress(userKey, failed.id);
    deleteExam(failed.id).catch(() => {});
  }

  /* ---------- Submitting ---------- */
  // The answers on this device are done with; the settings stay for "New exam on the same materials".
  function forgetAnswers(id) {
    const { settings } = loadExamProgress(userKey, id);
    clearExamProgress(userKey, id);
    if (settings) saveExamProgress(userKey, id, { answers: {}, current: 0, settings });
  }

  // The results: the exam read again (the submit response has no questions).
  async function showResults(id) {
    forgetAnswers(id);
    try {
      examState.seed(await getExam(id));
    } catch {
      examState.reload();
    }
  }

  async function submit(answers) {
    const target = exam;
    setGrading(true);
    setNotice(null);
    try {
      const submitted = await submitExam(target.id, target.questions, answers);
      // Shown until the read with the results lands.
      examState.seed({ ...target, ...submitted });
      await showResults(target.id);
    } catch (err) {
      // Already submitted (e.g. in another tab), or the response was lost on the way (a
      // timeout or the network): the exam may be submitted anyway, so look before failing.
      if (err?.status === 409 || err?.status === null || err?.status === undefined) {
        const current = await getExam(target.id).catch(() => null);
        if (current?.status === "submitted") {
          forgetAnswers(target.id);
          examState.seed(current);
          setNotice(err.status === 409 ? t("This exam was already submitted. These are its results.") : t("Your exam was submitted. These are its results."));
          return;
        }
      }
      throw err;
    } finally {
      setGrading(false);
    }
  }

  async function regrade() {
    try {
      await regradeExam(exam.id);
    } catch (err) {
      // 409: nothing is left to grade (it was graded meanwhile), so just show it.
      if (err?.status !== 409) throw err;
    }
    examState.seed(await getExam(exam.id));
  }

  function newExamFrom(done) {
    const saved = loadExamProgress(userKey, done.id).settings;
    const types = QUESTION_TYPES.map((type) => type.value).filter((value) => (done.questions ?? []).some((question) => question.type === value));
    toSetup({
      examPreset: {
        lectureIds: (saved?.lectureIds ?? (done.lectures ?? []).map((item) => item.lecture_id)).filter(Boolean),
        questionCount: saved?.questionCount ?? done.question_count,
        types: saved?.types ?? types,
      },
    });
  }

  async function discard(target) {
    await unfinished.discard(target.id);
    clearExamProgress(userKey, target.id);
    setNotice(t("Exam discarded."));
  }

  /* ---------- What to show ---------- */
  // A preset whose materials aren't all in this chat is chosen from the library.
  const presetIds = preset?.lectureIds ?? [];
  const fromChat = chatLectures.length > 0 && presetIds.every((id) => chatLectures.some((item) => item.id === id));
  const materials = (fromChat ? chatLectures : library).map(toExamMaterial);
  const presetGone = preset && !materialsLoading ? presetIds.filter((id) => !materials.some((item) => item.id === id)).length : 0;

  let step = "setup";
  let body;
  if (!examId) {
    body = (
      <ExamSetup
        materials={materials}
        fromChat={fromChat}
        loading={materialsLoading}
        unfinished={{ exams: unfinished.exams, loading: unfinished.loading, error: unfinished.error, onReload: unfinished.reload }}
        userKey={userKey}
        onStart={start}
        starting={starting}
        startError={startError}
        onOpenExam={(id) => openExam(id)}
        onDiscard={discard}
        preset={preset}
      />
    );
    if (preset && (presetGone > 0 || presetIds.length === 0)) {
      body = (
        <>
          <p className="exam-notice" role="status">
            {presetIds.length === 0 || presetGone === presetIds.length
              ? t("The materials of that exam were deleted, so pick others.")
              : presetGone === 1
                ? t("1 material of that exam was deleted, so it isn’t chosen.")
                : t("{count} materials of that exam were deleted, so they aren’t chosen.", { count: presetGone })}
          </p>
          {body}
        </>
      );
    }
    if (!unfinished.available) {
      body = (
        <section className="exam-card exam-card--center">
          <h3 className="exam-card__title">{t("Exams aren’t available")}</h3>
          <p className="exam-muted">{t("This server can’t generate exams yet.")}</p>
        </section>
      );
    }
  } else if (!exam) {
    body = examState.error && !missing ? (
      <section className="exam-card exam-card--center">
        <p className="exam-error" role="alert">
          {examState.error.message || t("The exam could not be loaded.")}
        </p>
        <div className="exam-actions">
          <Button variant="primary" onClick={examState.reload}>
            {t("Try again")}
          </Button>
          <Button onClick={() => toSetup()}>{t("Back")}</Button>
        </div>
      </section>
    ) : (
      <p className="exam-muted exam-loading" role="status">
        {t("Loading the exam…")}
      </p>
    );
  } else if (exam.status === "generating" || exam.status === "failed") {
    step = exam.status;
    body = (
      <ExamGenerating
        exam={exam}
        onRetry={retry}
        onBack={() => toSetup()}
        retrying={starting}
        retryError={startError}
        onOpenExam={(id) => openExam(id)}
        loadError={examState.error}
        onReload={examState.reload}
      />
    );
  } else if (exam.status === "ready" && exam.questions?.length) {
    step = grading ? "grading" : "ready";
    body = <ExamQuestions key={exam.id} exam={exam} userKey={userKey} sourceType={sourceType} onSubmit={submit} grading={grading} />;
  } else if (exam.status === "submitted" && exam.questions?.length && exam.questions.every((question) => question.result)) {
    step = "submitted";
    body = (
      <ExamResults
        key={exam.id}
        exam={exam}
        onOpenSource={onOpenSource}
        onRegrade={regrade}
        onNewExam={() => newExamFrom(exam)}
        onAsk={onAskAbout ? (question) => onAskAbout(exam, question) : null}
      />
    );
  } else if (exam.status === "submitted") {
    // Just submitted: the results are still being read (or the read failed).
    step = "submitted";
    body = examState.error ? (
      <section className="exam-card exam-card--center">
        <p className="exam-error" role="alert">
          {examState.error.message || t("The results could not be loaded.")}
        </p>
        <div className="exam-actions">
          <Button variant="primary" onClick={examState.reload}>
            {t("Try again")}
          </Button>
        </div>
      </section>
    ) : (
      <p className="exam-muted exam-loading" role="status">
        {t("Loading the results…")}
      </p>
    );
  } else {
    body = (
      <section className="exam-card exam-card--center">
        <h3 className="exam-card__title">{t("This exam has no questions")}</h3>
        <div className="exam-actions">
          <Button onClick={() => toSetup()}>{t("New exam")}</Button>
        </div>
      </section>
    );
  }

  const title = exam?.title;
  return (
    <section className="exam" aria-labelledby="exam-title">
      <header className="exam-head">
        <div className="exam-head__text">
          <h2 id="exam-title" className="exam-head__title">
            {title ? t("Exam · {title}", { title }) : t("Exam")}
          </h2>
          <span className="exam-head__step">{stepLabel(step, t) ?? ""}</span>
        </div>
        <Link to={backToChat} className="btn btn--secondary exam-head__back">
          <Icon name="arrowLeft" />
          {t("Back to chat")}
        </Link>
      </header>

      <div className="exam-scroll">
        <div className="exam-column">
          {notice && (
            <p className="exam-notice" role="status">
              {notice}
            </p>
          )}
          {body}
        </div>
      </div>
    </section>
  );
}
