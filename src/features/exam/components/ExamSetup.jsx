import { useId, useState } from "react";

import Button from "../../../components/ui/Button.jsx";
import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { QUESTION_COUNTS, QUESTION_TYPES } from "../../../api/services/exams.js";
import { countAnswered, loadExamProgress } from "../../../services/exam/examStorage.js";
import { formatExamDate } from "../examFormat.js";

/*
  Step 1: set up a new exam, or continue an unfinished one.

  - Materials: the open chat's materials, all preselected; for a chat without materials the
    student's library, nothing preselected. Materials without readable text yet (still
    processing, failed, images) can't be picked.
  - Number of questions (3, 5, 7, 10) and question types (at least one).
  - With `preset` (New exam on the same materials) its lectures, number and types are
    chosen at first instead.
  - "Continue an exam" lists the exams being generated or ready to answer, each with
    Continue and Discard (after a confirmation).

  Props:
    materials      [{ id, title, meta, selectable, reason }]
    fromChat       true: `materials` are the open chat's; false: the library
    loading        materials still loading
    unfinished     { exams, loading, error, onReload }  (see useUnfinishedExams)
    userKey        whose answers on this device to count
    onStart({ lectureIds, questionCount, types }), starting, startError { message, busyId }
    onOpenExam(id), onDiscard(exam) → Promise (rejects with the error to show)
    preset         { lectureIds, questionCount, types } to start from, or null
*/
export default function ExamSetup({
  materials,
  fromChat,
  loading,
  unfinished,
  userKey,
  onStart,
  starting,
  startError,
  onOpenExam,
  onDiscard,
  preset = null,
}) {
  const { t } = useI18n();
  const hintId = useId();
  // null until the student changes the selection: then the defaults follow the materials.
  const [picked, setPicked] = useState(() => preset?.lectureIds ?? null);
  const [count, setCount] = useState(() => (QUESTION_COUNTS.includes(preset?.questionCount) ? preset.questionCount : 5));
  const [types, setTypes] = useState(() => {
    const allowed = QUESTION_TYPES.map((type) => type.value);
    const chosen = allowed.filter((value) => preset?.types?.includes(value));
    return chosen.length > 0 ? chosen : allowed;
  });

  const selectable = materials.filter((item) => item.selectable);
  const defaults = fromChat ? selectable.map((item) => item.id) : [];
  const selected = (picked ?? defaults).filter((id) => selectable.some((item) => item.id === id));

  function toggleMaterial(id) {
    const current = picked ?? defaults;
    setPicked(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleType(value) {
    // Kept in the listed order.
    setTypes((list) => QUESTION_TYPES.map((type) => type.value).filter((item) => (item === value ? !list.includes(item) : list.includes(item))));
  }

  let hint;
  if (selected.length === 0) hint = t("Pick at least one material.");
  else if (types.length === 0) hint = t("Pick at least one question type.");
  else if (selected.length === 1) hint = t("{count} questions from 1 material", { count });
  else hint = t("{count} questions from {materials} materials", { count, materials: selected.length });
  const valid = selected.length > 0 && types.length > 0;

  function submit(event) {
    event.preventDefault();
    if (!valid || starting) return;
    // In the order the materials are listed.
    const lectureIds = materials.map((item) => item.id).filter((id) => selected.includes(id));
    onStart({ lectureIds, questionCount: count, types });
  }

  return (
    <>
      <UnfinishedExams {...unfinished} userKey={userKey} onOpenExam={onOpenExam} onDiscard={onDiscard} />

      <form className="exam-card exam-setup" aria-labelledby="exam-setup-title" onSubmit={submit} noValidate>
        <div>
          <h3 id="exam-setup-title" className="exam-card__title">
            {t("New exam")}
          </h3>
          <p className="exam-card__lead">
            {preset
              ? t("The materials and settings of that exam are chosen. Change them if you like.")
              : fromChat
                ? t("Questions are generated from this chat’s materials. Your answers are kept on this device.")
                : t("This chat has no materials, so pick from your library. Your answers are kept on this device.")}
          </p>
        </div>

        <fieldset className="exam-field">
          <legend className="exam-field__legend">{fromChat ? t("Materials in this chat") : t("Your materials")}</legend>
          {loading ? (
            <p className="exam-muted" role="status">
              {t("Loading materials…")}
            </p>
          ) : materials.length === 0 ? (
            <p className="exam-muted">{t("You have no materials yet. Upload a lecture in the chat, then come back to start an exam.")}</p>
          ) : (
            <ul className="exam-materials">
              {materials.map((item) => {
                const on = selected.includes(item.id);
                return (
                  <li key={item.id}>
                    <label className={`exam-material ${on ? "exam-material--on" : ""} ${item.selectable ? "" : "exam-material--off"}`}>
                      <input type="checkbox" checked={on} disabled={!item.selectable} onChange={() => toggleMaterial(item.id)} />
                      <span className="exam-material__box" aria-hidden="true">
                        {on && <Icon name="check" />}
                      </span>
                      <span className="exam-material__text">
                        <span className="exam-material__title">{item.title}</span>
                        <span className="exam-material__meta">{item.selectable ? item.meta : item.reason}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <div className="exam-setup__row">
          <fieldset className="exam-field">
            <legend className="exam-field__legend">{t("Number of questions")}</legend>
            <div className="exam-pills">
              {QUESTION_COUNTS.map((value) => (
                <label key={value} className={`exam-pill exam-pill--count ${count === value ? "exam-pill--on" : ""}`}>
                  <input type="radio" name="exam-question-count" value={value} checked={count === value} onChange={() => setCount(value)} />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="exam-field">
            <legend className="exam-field__legend">{t("Question types")}</legend>
            <div className="exam-pills">
              {QUESTION_TYPES.map((type) => {
                const on = types.includes(type.value);
                return (
                  <label key={type.value} className={`exam-pill ${on ? "exam-pill--on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleType(type.value)} />
                    {{ multiple_choice: t("Multiple choice"), short_answer: t("Short answer") }[type.value] ?? type.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="exam-setup__actions">
          <Button type="submit" variant="primary" className="exam-btn-lg" disabled={!valid || starting || loading} aria-describedby={hintId}>
            {starting ? t("Starting…") : t("Generate exam")}
          </Button>
          <span id={hintId} className={`exam-muted ${valid ? "" : "exam-setup__invalid"}`}>
            {hint}
          </span>
        </div>

        {startError && (
          <div className="exam-alert" role="alert">
            <p>{startError.message}</p>
            {startError.busyId && (
              <Button size="sm" onClick={() => onOpenExam(startError.busyId)}>
                {t("Open that exam")}
              </Button>
            )}
          </div>
        )}
      </form>
    </>
  );
}

function UnfinishedExams({ exams, loading, error, onReload, userKey, onOpenExam, onDiscard }) {
  const { t } = useI18n();
  const [discarding, setDiscarding] = useState(null);
  const [discardError, setDiscardError] = useState(null);

  if (loading || (!error && exams.length === 0)) return null;

  async function confirmDiscard() {
    const exam = discarding;
    setDiscarding(null);
    setDiscardError(null);
    try {
      await onDiscard(exam);
    } catch (err) {
      setDiscardError(err.message || t("The exam could not be discarded."));
    }
  }

  return (
    <section className="exam-card exam-unfinished" aria-labelledby="exam-unfinished-title">
      <h3 id="exam-unfinished-title" className="exam-card__subtitle">
        {t("Continue an exam")}
      </h3>
      {error ? (
        <div className="exam-alert" role="alert">
          <p>{error}</p>
          <Button size="sm" onClick={onReload}>
            {t("Try again")}
          </Button>
        </div>
      ) : (
        <ul className="exam-unfinished__list">
          {exams.map((exam) => {
            const generating = exam.status === "generating";
            const answered = generating ? 0 : countAnswered(loadExamProgress(userKey, exam.id).answers);
            const total = generating ? exam.question_count : exam.questions_ready;
            return (
              <li key={exam.id} className="exam-unfinished__item">
                <div className="exam-unfinished__text">
                  <span className="exam-unfinished__title">{exam.title}</span>
                  <span className="exam-muted exam-unfinished__meta">
                    {generating
                      ? t("Generating · {ready} of {total} questions ready", { ready: exam.questions_ready, total: exam.question_count })
                      : t("{answered} of {total} answered", { answered, total })}
                    {" · "}
                    {formatExamDate(exam.created_at)}
                  </span>
                </div>
                <div className="exam-unfinished__actions">
                  <Button size="sm" aria-label={t("Continue {title}", { title: exam.title })} onClick={() => onOpenExam(exam.id)}>
                    {t("Continue")}
                  </Button>
                  <IconButton icon="trash" label={t("Discard {title}", { title: exam.title })} onClick={() => setDiscarding(exam)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {discardError && (
        <p className="exam-error" role="alert">
          {discardError}
        </p>
      )}
      {discarding && (
        <ConfirmDialog title={t("Discard this exam?")} confirmLabel={t("Discard exam")} danger onConfirm={confirmDiscard} onCancel={() => setDiscarding(null)}>
          <p>
            {t("“{title}” and its questions are deleted, together with your answers on this device. This can’t be undone.", { title: discarding.title })}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
