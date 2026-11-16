import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";

import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import Menu from "../../../components/ui/Menu.jsx";
import ChatComposer from "../components/ChatComposer.jsx";
import { DeleteProjectDialog, ProjectNameDialog } from "../components/ProjectDialogs.jsx";
import { addProjectLecture, getProject, listProjectChats, removeProjectLecture } from "../../../api/services/projects.js";
import { groupOf } from "../../../services/materials/materialTypes.js";
import { STATUS_LABEL, toMaterial } from "../../lectures/materialTypes.js";
import { displayChatTitle } from "../../../services/notebook/cellContext.js";
import { useI18n } from "../../../i18n/i18n.js";
import { activityDate } from "../projectText.js";
import "../projects.css";

// The project's chats are loaded this many at a time (more as the list is scrolled).
const PROJECT_CHATS_PAGE_SIZE = 20;

/*
  A project (/workspace/projects/<id>): its name with ⋯ (Rename, Delete), an input box that
  starts a new chat in the project and opens it with the answer, the project's materials
  (open beside the page, remove, add one of the student's materials, upload new ones) and
  the project's chats, most recently active first (more load while scrolling). Every chat in
  the project answers from these materials; without any it answers from general knowledge.

  The shared state lives in WorkspaceLayout (`projectsView` in the Outlet context).
*/
export default function ProjectPage() {
  const { projectsView } = useOutletContext();
  const { projectId } = useParams();
  // A fresh page (and requests) for another project.
  return <ProjectView key={projectId} projectId={projectId} {...projectsView} />;
}

export function ProjectView({
  projectId,
  available,
  version = 0,
  library = [],
  model = null,
  note = null,
  viewerLectureId = null,
  uploads = [],
  onDismissUpload = () => {},
  onOpenChat,
  onStartChat,
  onRename,
  onDelete,
  onUploadClick,
  onOpenMaterial,
  onProjectChanged,
  onNotFound,
}) {
  const { t } = useI18n();
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [chats, setChats] = useState([]);
  const [chatsPage, setChatsPage] = useState({ page: 0, totalPages: 0, total: 0, loading: true });
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [unlinking, setUnlinking] = useState(null); // the material whose × is being confirmed
  const [attempt, setAttempt] = useState(0); // "Try again" after a failed load
  const scrollRef = useRef(null);
  const moreRef = useRef(null);
  const loadingMore = useRef(false);

  // The project and the first page of its chats (again after an upload added materials).
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    getProject(projectId, { signal }).then(
      (found) => {
        setProject(found);
        setLoadError(null);
      },
      (err) => {
        if (signal.aborted || err?.name === "CanceledError") return;
        if (err?.status === 404) onNotFound?.();
        else setLoadError(err.message || t("This project could not be loaded."));
      }
    );
    listProjectChats(projectId, { page: 1, pageSize: PROJECT_CHATS_PAGE_SIZE, signal }).then(
      (first) => {
        setChats(first.sessions);
        setChatsPage({ page: 1, totalPages: first.total_pages, total: first.total, loading: false });
      },
      () => !signal.aborted && setChatsPage((current) => ({ ...current, loading: false }))
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, version, attempt]);

  const more = chatsPage.page < chatsPage.totalPages;
  const loadMore = useCallback(async () => {
    if (loadingMore.current || chatsPage.page >= chatsPage.totalPages) return;
    loadingMore.current = true;
    try {
      const next = await listProjectChats(projectId, { page: chatsPage.page + 1, pageSize: PROJECT_CHATS_PAGE_SIZE });
      setChats((list) => [...list, ...next.sessions.filter((item) => !list.some((shown) => shown.id === item.id))]);
      setChatsPage({ page: next.page, totalPages: next.total_pages, total: next.total, loading: false });
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMore.current = false;
    }
  }, [projectId, chatsPage.page, chatsPage.totalPages]);

  // More chats load when the end of the list scrolls into view.
  useEffect(() => {
    const target = moreRef.current;
    if (!more || !target || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), {
      root: scrollRef.current,
      rootMargin: "0px 0px 200px 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [more, loadMore, chats.length]);

  async function changeMaterials(call) {
    try {
      const updated = await call();
      setProject(updated);
      setActionError(null);
      onProjectChanged(updated);
    } catch (err) {
      setActionError(err.message);
    }
  }

  function startChat(text) {
    if (starting) return false;
    setStarting(true);
    setActionError(null);
    // Resolves once the chat is created and opened (the answer follows there).
    Promise.resolve(onStartChat(project, text))
      .catch((err) => setActionError(err.message || t("The chat could not be started.")))
      .finally(() => setStarting(false));
    return true;
  }

  if (!project) {
    return (
      <section className="project" aria-label={t("Project")}>
        {loadError ? (
          <div className="project__error" role="alert">
            <p>{loadError}</p>
            <button type="button" className="cf-link-button" onClick={() => setAttempt((value) => value + 1)}>
              {t("Try again")}
            </button>
          </div>
        ) : (
          <p className="project__note" role="status">
            {t("Loading the project…")}
          </p>
        )}
      </section>
    );
  }
  const projectUploads = uploads.filter((item) => item.projectId === project.id);

  const lectures = project.lectures ?? [];
  const materials = lectures.map(toMaterial);
  const owned = new Set(lectures.map((item) => item.id));
  const addable = library.filter((item) => !owned.has(item.id)).map(toMaterial);

  return (
    <section className="project" aria-labelledby="project-title">
      <div className="chat__bar project__bar">
        <Icon name="folder" size={18} />
        <h1 id="project-title" className="chat__title" title={project.name}>
          {project.name}
        </h1>
        <Menu
          label={t("Project actions")}
          items={[
            { label: t("Rename project"), icon: "edit", onSelect: () => setRenaming(true) },
            { label: t("Delete project"), icon: "trash", danger: true, onSelect: () => setDeleting(true) },
          ]}
        />
      </div>
      {actionError && (
        <p className="project__error" role="alert">
          {actionError}
        </p>
      )}

      <div className="project__scroll" ref={scrollRef}>
        <div className="project__start">
          <ChatComposer
            onSend={startChat}
            onAttachClick={() => onUploadClick(project)}
            attachDisabled={available === false}
            disabled={starting || available !== true}
            note={note}
            placeholder={t("Start a new chat in {name}…", { name: project.name })}
            model={model}
          />
          <p className="chat__disclaimer">
            {materials.length > 0
              ? t("Every chat in this project answers from its materials.")
              : t("Add materials and the chats in this project answer from them. Until then they answer from general knowledge.")}
          </p>
        </div>

        <section className="project__section" aria-labelledby="project-materials-title">
          <div className="project__section-head">
            <h2 id="project-materials-title" className="cf-section-title">
              {t("Materials in this project")}
            </h2>
            <div className="cf-materials__actions">
              {addable.length > 0 && (
                <Menu
                  label={t("Add one of your materials to this project")}
                  icon="plus"
                  items={addable.map((material) => ({
                    key: material.id,
                    label: material.name,
                    icon: groupOf(material.type)?.icon ?? "fileText",
                    onSelect: () => changeMaterials(() => addProjectLecture(project.id, material.id)),
                  }))}
                />
              )}
              <IconButton
                icon="upload"
                label={t("Upload a material to this project")}
                onClick={() => onUploadClick(project)}
                disabled={available === false}
              />
            </div>
          </div>
          {projectUploads.length > 0 && (
            <ul className="cf-materials__list project__materials" aria-label={t("Uploads to this project")}>
              {projectUploads.map((upload) => (
                <li key={upload.id} className="cf-material cf-material--upload">
                  <span className="cf-material__open">
                    <span className="cf-material__icon">
                      <Icon name="upload" size={16} />
                    </span>
                    <span className="cf-material__text">
                      <span className="cf-material__name">{upload.name}</span>
                      {upload.error ? (
                        <span className="cf-material__meta cf-material__status--failed" role="alert">
                          {upload.error}
                        </span>
                      ) : (
                        <span
                          className="cf-progress"
                          role="progressbar"
                          aria-label={t("Uploading {name}", { name: upload.name })}
                          aria-valuenow={upload.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${upload.progress}%` }} />
                        </span>
                      )}
                    </span>
                  </span>
                  {upload.error && (
                    <IconButton icon="close" label={t("Dismiss {name}", { name: upload.name })} className="cf-material__remove" onClick={() => onDismissUpload(upload.id)} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {materials.length === 0 && projectUploads.length > 0 ? null : materials.length === 0 ? (
            <button type="button" className="cf-materials__empty" onClick={() => onUploadClick(project)} disabled={available === false}>
              {t("Upload a PDF, slides or a notebook for this project")}
            </button>
          ) : (
            <ul className="cf-materials__list project__materials" aria-label={t("Materials in this project")}>
              {materials.map((material) => {
                const opened = viewerLectureId === material.id;
                const status = material.status && material.status !== "completed" ? STATUS_LABEL[material.status] : null;
                return (
                  <li key={material.id} className={`cf-material project__material ${opened ? "cf-material--open" : ""}`}>
                    <button
                      type="button"
                      className="cf-material__open"
                      aria-label={t("Open {name} beside the project", { name: material.name })}
                      aria-pressed={opened}
                      onClick={() => onOpenMaterial(material)}
                    >
                      <span className="cf-material__icon">
                        <Icon name={material.type === "notebook" ? "code" : groupOf(material.type)?.icon ?? "fileText"} size={16} />
                      </span>
                      <span className="cf-material__text">
                        <span className="cf-material__name">{material.name}</span>
                        <span className="cf-material__meta">
                          {material.meta}
                          {status && <span className={`cf-material__status cf-material__status--${material.status}`}> · {status}</span>}
                        </span>
                      </span>
                    </button>
                    <IconButton
                      icon="close"
                      label={t("Remove {name} from this project", { name: material.name })}
                      className="cf-material__remove"
                      onClick={() => setUnlinking(material)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="project__section" aria-labelledby="project-chats-title">
          <h2 id="project-chats-title" className="cf-section-title project__section-head">
            {t("Chats in this project")}
          </h2>
          {chatsPage.loading && chats.length === 0 ? (
            <p className="project__note" role="status">
              {t("Loading the chats…")}
            </p>
          ) : chats.length === 0 ? (
            <p className="project__note">{t("No chats yet. Ask a question above to start one.")}</p>
          ) : (
            <ul className="project__chats" aria-label={t("Chats in this project")}>
              {chats.map((chat) => (
                <li key={chat.id}>
                  <button type="button" className="project__chat" onClick={() => onOpenChat(chat.id)}>
                    <Icon name="chat" size={16} />
                    <span className="project__chat-title">{displayChatTitle(chat.title)}</span>
                    <span className="project__chat-date">{activityDate(chat.updated_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {more && (
            <button ref={moreRef} type="button" className="cf-chats__more" onClick={loadMore}>
              {t("Show more chats")}
            </button>
          )}
        </section>
      </div>

      {unlinking && (
        <ConfirmDialog
          title={t("Remove from the project?")}
          confirmLabel={t("Remove")}
          danger
          onConfirm={() => {
            const material = unlinking;
            setUnlinking(null);
            changeMaterials(() => removeProjectLecture(project.id, material.id));
          }}
          onCancel={() => setUnlinking(null)}
        >
          {t("“{name}” will be removed from the project {project}: none of its chats answer from it any more. The file stays in your library.", {
            name: unlinking.name,
            project: project.name,
          })}
        </ConfirmDialog>
      )}
      {renaming && (
        <ProjectNameDialog
          project={project}
          onSave={async (name) => {
            const updated = await onRename(project, name);
            setProject((current) => ({ ...current, ...updated }));
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      )}
      {deleting && (
        <DeleteProjectDialog
          project={{ ...project, chat_count: Math.max(project.chat_count ?? 0, chatsPage.total) }}
          onConfirm={() => onDelete(project)}
          onCancel={() => setDeleting(false)}
        />
      )}
    </section>
  );
}
