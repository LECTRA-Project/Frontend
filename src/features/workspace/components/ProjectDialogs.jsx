import { useEffect, useId, useState } from "react";

import Button from "../../../components/ui/Button.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import TextField from "../../../components/ui/TextField.jsx";
import { listProjects } from "../../../api/services/projects.js";
import { displayChatTitle } from "../../../services/notebook/cellContext.js";
import { t as translate, useI18n } from "../../../i18n/i18n.js";

/*
  Dialogs of projects (a course's materials and chats grouped together).

  ProjectNameDialog   create (name only) or rename a project
  DeleteProjectDialog asks before deleting a project, naming what happens to its chats,
                      materials, exams and statistics
  MoveToProjectDialog moves a chat into one of the student's projects (or a new one)
*/

/*
  Props:
    project   the project to rename; none: a new project
    onSave    async (name) => void — rejects with the error to show
    onCancel  closes the dialog
*/
export function ProjectNameDialog({ project = null, onSave, onCancel }) {
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const trimmed = name.trim();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!trimmed) return;
    if (project && trimmed === project.name) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setError(err.message || t("The project could not be saved."));
      setSaving(false);
    }
  }

  return (
    <Modal title={project ? t("Rename project") : t("New project")} width={440} onClose={onCancel}>
      <form className="project-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label={t("Project name")}
          value={name}
          maxLength={255}
          autoFocus
          placeholder={project ? undefined : t("e.g. Linear Algebra")}
          onChange={(event) => setName(event.target.value)}
        />
        {!project && (
          <p className="project-form__hint">
            {t("A project keeps a course’s materials and chats together. Every chat in it answers from the project’s materials.")}
          </p>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="project-form__actions">
          <Button onClick={onCancel} disabled={saving}>
            {t("Cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !trimmed}>
            {saving ? t("Saving…") : project ? t("Rename") : t("Create project")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/*
  Props:
    project    { name, chat_count }
    onConfirm  async () => void — rejects with the error to show
    onCancel
*/
export function DeleteProjectDialog({ project, onConfirm, onCancel }) {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const chats = project.chat_count ?? 0;

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message || t("The project could not be deleted."));
      setDeleting(false);
    }
  }

  return (
    <Modal title={t("Delete project?")} width={460} onClose={onCancel}>
      <div className="confirm">
        <div className="confirm__text">
          <p>{t("“{name}” will be deleted.", { name: project.name })}</p>
          <ul className="project-delete__list">
            <li>
              {chats === 1
                ? t("Its 1 chat and all its messages will be deleted permanently.")
                : t("All {count} chats in it and their messages will be deleted permanently.", { count: chats })}
            </li>
            <li>{t("Its materials stay in your library.")}</li>
            <li>{t("Your exams and statistics are not affected.")}</li>
          </ul>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="confirm__actions">
          <Button onClick={onCancel} disabled={deleting}>
            {t("Cancel")}
          </Button>
          <Button variant="danger" onClick={confirm} disabled={deleting}>
            {deleting ? t("Deleting…") : t("Delete project")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/*
  Props:
    session    the chat to move ({ id, title, lectures, project })
    onMove     async (projectId, { addMaterials }) => void — rejects with the error to show
    onCreate   async (name) => project — creates a project to move the chat into
    onCancel
*/
export function MoveToProjectDialog({ session, onMove, onCreate, onCancel }) {
  const { t } = useI18n();
  const groupId = useId();
  const [projects, setProjects] = useState(null); // null while loading
  const [loadError, setLoadError] = useState(null);
  const [choice, setChoice] = useState(null); // a project id, or NEW
  const [newName, setNewName] = useState("");
  const [addMaterials, setAddMaterials] = useState(true);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState(null);
  const own = session.lectures ?? [];
  const title = displayChatTitle(session.title) ?? t("New chat");

  useEffect(() => {
    const controller = new AbortController();
    listProjects({ page: 1, pageSize: 100, signal: controller.signal }).then(
      (page) => {
        const others = page.projects.filter((item) => item.id !== session.project?.id);
        setProjects(others);
        setChoice(others[0]?.id ?? NEW);
      },
      (err) => {
        if (controller.signal.aborted) return;
        setLoadError(err.message || translate("Your projects could not be loaded."));
        setProjects([]);
        setChoice(NEW);
      }
    );
    return () => controller.abort();
  }, [session.project?.id]);

  const ready = choice === NEW ? newName.trim().length > 0 : Boolean(choice);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!ready) return;
    setMoving(true);
    setError(null);
    try {
      const projectId = choice === NEW ? (await onCreate(newName.trim())).id : choice;
      await onMove(projectId, { addMaterials: own.length > 0 && addMaterials });
    } catch (err) {
      setError(err.message || t("The chat could not be moved."));
      setMoving(false);
    }
  }

  return (
    <Modal title={t("Move to project")} width={480} onClose={onCancel}>
      <form className="project-form" onSubmit={handleSubmit} noValidate>
        <p className="project-form__hint">
          {t("“{title}” will answer from the project’s materials, like every chat in it.", { title })}
        </p>
        {projects === null ? (
          <p className="project-form__hint" role="status">
            {t("Loading your projects…")}
          </p>
        ) : (
          <fieldset className="project-move__choices">
            <legend className="project-move__legend">{t("Project")}</legend>
            {loadError && (
              <p className="field__error" role="alert">
                {loadError}
              </p>
            )}
            {projects.map((project) => (
              <label key={project.id} className="project-move__choice">
                <input type="radio" name={groupId} checked={choice === project.id} onChange={() => setChoice(project.id)} />
                <span className="project-move__name">{project.name}</span>
              </label>
            ))}
            <label className="project-move__choice">
              <input type="radio" name={groupId} checked={choice === NEW} onChange={() => setChoice(NEW)} />
              <span className="project-move__name">{t("New project")}</span>
            </label>
            {choice === NEW && (
              <TextField
                label={t("Project name")}
                value={newName}
                maxLength={255}
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </fieldset>
        )}
        {own.length > 0 && (
          <label className="project-move__materials">
            <input type="checkbox" checked={addMaterials} onChange={(event) => setAddMaterials(event.target.checked)} />
            <span>
              {own.length === 1
                ? t("Also add this chat’s material to the project ({name})", { name: own[0].title })
                : t("Also add this chat’s {count} materials to the project", { count: own.length })}
            </span>
          </label>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="project-form__actions">
          <Button onClick={onCancel} disabled={moving}>
            {t("Cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={moving || !ready}>
            {moving ? t("Moving…") : t("Move")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const NEW = "new-project";
