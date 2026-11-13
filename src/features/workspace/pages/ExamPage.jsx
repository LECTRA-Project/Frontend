import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { deleteExam, listAllExams, QUESTION_TYPES, startExam } from "../../../api/services/exams.js";
import { clearExamProgress, loadExamProgress, updateExamProgress } from "../../../services/exam/examStorage.js";
import { toMaterial } from "../../lectures/materialTypes.js";
import ExamSetup from "../../exam/components/ExamSetup.jsx";
import ExamGenerating from "../../exam/components/ExamGenerating.jsx";
import ExamQuestions from "../../exam/components/ExamQuestions.jsx";
import { useExam } from "../../exam/useExam.js";
import { useUnfinishedExams } from "../../exam/useUnfinishedExams.js";
import "../../exam/exam.css";

/*
  Centre view at /workspace/exam: an exam generated from the student's materials.

    no ?exam=          Step 1, set up (or continue an unfinished exam)       ExamSetup
    ?exam=<id>         generating: "2 of 5 questions ready" (polled), failed: Retry / Back
                                                                             ExamGenerating
                       ready: Step 2, the questions; Finish opens the review  ExamQuestions

  The exam id is in the URL next to the workspace's ?chat= / ?lecture=, so a reload or a
  shared link opens the same exam, and "Back to chat" returns to the same chat. Answers are
  kept on this device (services/exam/examStorage.js) until the exam is submitted.

  The data it needs from WorkspaceLayout comes through the Outlet context (`examView`):
  userKey, the open chat's lectures, the library and whether they are still loading.
*/
const STEPS = {
  setup: "Step 1 of 3 · Set up",
  generating: "Step 1 of 3 · Generating",
  failed: "Step 1 of 3 · Generating",
  ready: "Step 2 of 3 · Answer",
};

// Lectures without readable text yet: the backend can't write questions from them (422).
const NOT_READY = {
  uploading: "Still uploading",
  processing: "Still processing, not ready for an exam yet",
  failed: "Processing failed, so no questions can be made from it",
  skipped: "No readable text (images can’t be used for exams)",
};

function toExamMaterial(lecture) {
  const material = toMaterial(lecture);
  const reason = NOT_READY[material.status] ?? null;
  return { id: lecture.id, title: lecture.title, meta: material.meta, selectable: !reason, reason };
}

export default function ExamPage() {
  const { examView } = useOutletContext();
  const { userKey, chatLectures, library, loading: materialsLoading, sourceType } = examView;
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
    navigate({ pathname: location.pathname, search: searchWith(id) }, { replace });
  }

  function toSetup({ replace = false } = {}) {
    setStartError(null);
    unfinished.reload();
    navigate({ pathname: location.pathname, search: searchWith(null) }, { replace });
  }

  // A link to an exam that isn't the student's (or no longer exists): say so, show the setup.
  const missing = examState.error?.status === 404 || examState.error?.status === 422;
  useEffect(() => {
    if (!examId || !missing) return;
    setNotice("That exam isn’t in your exams. It may have been discarded.");
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
      setStartError({ message: err.message || "The exam could not be started.", busyId });
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

  async function discard(target) {
    await unfinished.discard(target.id);
    clearExamProgress(userKey, target.id);
    setNotice("Exam discarded.");
  }

  /* ---------- What to show ---------- */
  const fromChat = chatLectures.length > 0;
  const materials = (fromChat ? chatLectures : library).map(toExamMaterial);

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
      />
    );
    if (!unfinished.available) {
      body = (
        <section className="exam-card exam-card--center">
          <h3 className="exam-card__title">Exams aren’t available</h3>
          <p className="exam-muted">This server can’t generate exams yet.</p>
        </section>
      );
    }
  } else if (!exam) {
    body = examState.error && !missing ? (
      <section className="exam-card exam-card--center">
        <p className="exam-error" role="alert">
          {examState.error.message || "The exam could not be loaded."}
        </p>
        <div className="exam-actions">
          <Button variant="primary" onClick={examState.reload}>
            Try again
          </Button>
          <Button onClick={() => toSetup()}>Back</Button>
        </div>
      </section>
    ) : (
      <p className="exam-muted exam-loading" role="status">
        Loading the exam…
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
    step = "ready";
    body = <ExamQuestions key={exam.id} exam={exam} userKey={userKey} sourceType={sourceType} />;
  } else {
    body = (
      <section className="exam-card exam-card--center">
        <h3 className="exam-card__title">{exam.status === "submitted" ? "This exam was submitted" : "This exam has no questions"}</h3>
        <div className="exam-actions">
          <Button onClick={() => toSetup()}>New exam</Button>
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
            Exam{title ? ` · ${title}` : ""}
          </h2>
          <span className="exam-head__step">{STEPS[step] ?? ""}</span>
        </div>
        <Link to={backToChat} className="btn btn--secondary exam-head__back">
          <Icon name="arrowLeft" />
          Back to chat
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
