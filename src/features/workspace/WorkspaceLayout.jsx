import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import UploadDialog from "../files/UploadDialog.jsx";
import PdfViewerPanel from "../files/PdfViewerPanel.jsx";
import MaterialViewerPanel from "../files/MaterialViewerPanel.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import EditLectureDialog from "../lectures/EditLectureDialog.jsx";
import DeleteLectureDialog from "../lectures/DeleteLectureDialog.jsx";
import LectureContentPanel from "../lectures/LectureContentPanel.jsx";
import { toMaterial } from "../lectures/materialTypes.js";
import { useLectureLibrary } from "../lectures/useLectureLibrary.js";
import { useAuth } from "../auth/authContext.js";
import { useNotebook } from "../notebook/useNotebook.js";
import { usePythonKernel } from "../notebook/usePythonKernel.js";
import { fetchLectureFile } from "../../api/services/lectures.js";
import "./workspace.css";

// Opened in the centre with their original file (fetched from the backend).
const FILE_VIEWERS = new Set(["pdf", "notes"]);

/* Basic mode: the stored file's public URL (needs the bucket to allow this origin). */
async function downloadFromStorage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The file could not be downloaded (HTTP ${response.status}).`);
  return response.blob();
}

/*
  The main study workspace:
    header on top, then three columns —
    Course materials | Notebook, Exam or an open lecture | Study assistant

  Lecture materials come from the backend (useLectureLibrary). What a click opens:
    PDF       the PDF viewer (at the cited page when opened from an assistant source)
    notes     the rendered Markdown (MaterialViewerPanel)
    slides    the extracted slides (LectureContentPanel); browsers cannot render PowerPoint
    notebook  the runnable notebook in the centre (useNotebook + Pyodide kernel)
  An assistant source for a slide, notebook cell or notes section opens LectureContentPanel
  with that place highlighted.

  Basic mode: a backend without AI processing (detected by useLectureLibrary) has no
  file/content/assistant endpoints and only supports renaming. Files are then opened
  from the lecture's public S3 URL, and the AI parts say they are not available.

  This component owns the state shared between the panels: the open lecture, its fetched
  file, the dialogs, and the notebook with its kernel (so they survive switching to the
  Exam view and back).
*/
export default function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userKey = user?.id ?? user?.email ?? "signed-in-user";
  const library = useLectureLibrary();
  const materials = library.lectures.map(toMaterial);
  const basic = library.features?.ai === false;
  const { kernel, kernelState } = usePythonKernel();
  const notebookState = useNotebook(kernel, userKey);

  const [selectedId, setSelectedId] = useState(null);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState(null); // lecture
  const [deleting, setDeleting] = useState(null); // lecture
  const [notice, setNotice] = useState(null);
  // The lecture shown in the centre, plus the URL it was opened on: it only shows while
  // the URL is unchanged, so the Exam button or "Back to notebook" leaves it automatically.
  // focus = { sourceType, sourceNumber } from a cited source.
  const [open, setOpen] = useState(null); // { lectureId, path, focus }
  const [openedFile, setOpenedFile] = useState(null); // { key, url, file, error }

  const openMaterial =
    open && open.path === location.pathname ? materials.find((item) => item.id === open.lectureId) ?? null : null;
  const showsSource = openMaterial !== null && (open.focus?.sourceType ?? "page") !== "page";
  const needsFile = openMaterial !== null && FILE_VIEWERS.has(openMaterial.type) && !showsSource && !basic;
  const fileKey = needsFile ? `${openMaterial.id}:${openMaterial.lecture.content_version}` : null;

  // Fetch the open PDF or notes file (the file endpoint needs the auth header, so an
  // <iframe src> or a plain link can't load it directly).
  useEffect(() => {
    if (!fileKey) return undefined;
    const lecture = materials.find((item) => `${item.id}:${item.lecture.content_version}` === fileKey)?.lecture;
    if (!lecture) return undefined;
    const controller = new AbortController();
    let url = null;
    fetchLectureFile(lecture.id, { signal: controller.signal }).then(
      (blob) => {
        const file = new File([blob], lecture.original_filename, { type: blob.type || lecture.file_type });
        url = URL.createObjectURL(file);
        setOpenedFile({ key: fileKey, url, file, error: null });
      },
      (err) => {
        if (!controller.signal.aborted) setOpenedFile({ key: fileKey, url: null, file: null, error: err.message || "The file could not be loaded." });
      }
    );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // materials changes on every poll; the key captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  function openLecture(lectureId, focus = null) {
    setSelectedId(lectureId);
    setOpen({ lectureId, path: location.pathname, focus });
  }

  async function openNotebook(material) {
    setSelectedId(material.id);
    setOpen(null);
    if (location.pathname !== "/workspace") navigate("/workspace");
    try {
      const blob = basic ? await downloadFromStorage(material.lecture.s3_url) : await fetchLectureFile(material.id);
      await notebookState.actions.openFile(new File([blob], material.lecture.original_filename, { type: "application/x-ipynb+json" }));
    } catch (err) {
      if (basic) {
        // Usually the bucket's CORS rule does not include this site's origin.
        setNotice("This notebook can’t be loaded here (the file storage blocks this site). You can download it instead.");
        openLecture(material.id);
      } else {
        setNotice(err.message || "The notebook could not be opened.");
      }
    }
  }

  function handleSelectMaterial(material) {
    if (material.type === "notebook") openNotebook(material);
    else openLecture(material.id);
  }

  function handleOpenReference(ref) {
    if (!materials.some((item) => item.id === ref.lecture_id)) {
      setNotice("That lecture is no longer in your materials.");
      return;
    }
    openLecture(ref.lecture_id, { sourceType: ref.source_type, sourceNumber: ref.source_number });
  }

  async function handleUpload(files, options) {
    setUploadOpen(false);
    setMaterialsCollapsed(false);
    const created = await library.upload(files, options);
    if (created.length) setNotice(`${created.length === 1 ? "1 file" : `${created.length} files`} uploaded — processing for the assistant.`);
  }

  async function handleRetry(material) {
    try {
      await library.retry(material.id);
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function handleSave(changes) {
    await library.update(editing.id, changes);
    setEditing(null);
    setNotice(changes.file ? "File replaced — processing the new version." : "Lecture updated.");
  }

  async function handleDelete() {
    await library.remove(deleting.id);
    if (open?.lectureId === deleting.id) setOpen(null);
    if (selectedId === deleting.id) setSelectedId(null);
    setDeleting(null);
    setNotice("Lecture deleted.");
  }

  const fileState = openedFile?.key === fileKey ? openedFile : null;
  // A cited page can be out of range after the file was replaced with a shorter one.
  const citedPage = open?.focus?.sourceType === "page" ? open.focus.sourceNumber : 1;
  const pdfPage = Math.max(1, Math.min(citedPage, openMaterial?.pages || citedPage));

  let centre = null;
  if (openMaterial && openMaterial.type === "pdf" && !showsSource) {
    centre = (
      // `key` resets page and zoom when another PDF, version or cited page is opened.
      <PdfViewerPanel
        key={`${fileKey}:${pdfPage}`}
        material={
          basic
            ? { ...openMaterial, url: openMaterial.lecture.s3_url, loading: false, loadError: null }
            : { ...openMaterial, url: fileState?.url ?? null, loading: !fileState, loadError: fileState?.error ?? null }
        }
        initialPage={pdfPage}
        onCollapse={() => setOpen(null)}
      />
    );
  } else if (openMaterial && openMaterial.type === "notes" && !showsSource && fileState?.file) {
    centre = (
      <MaterialViewerPanel
        key={fileKey}
        material={{ ...openMaterial, name: openMaterial.lecture.original_filename, file: fileState.file, url: fileState.url }}
        onCollapse={() => setOpen(null)}
      />
    );
  } else if (openMaterial) {
    centre = (
      <LectureContentPanel
        key={`${openMaterial.id}:${open.focus?.sourceType}:${open.focus?.sourceNumber}`}
        lecture={openMaterial.lecture}
        focus={open.focus}
        onRetry={() => handleRetry(openMaterial)}
        onClose={() => setOpen(null)}
      />
    );
  }

  return (
    <div className="workspace">
      <WorkspaceHeader />

      {notice && (
        <TransientStatus key={notice} duration={4000} onDismiss={() => setNotice(null)}>
          <p className="workspace__notice" role="status">
            {notice}
          </p>
        </TransientStatus>
      )}

      <div className={`workspace__body ${materialsCollapsed ? "workspace__body--materials-collapsed" : ""}`}>
        <CourseMaterialsPanel
          materials={materials}
          uploads={library.uploads}
          loading={library.loading}
          error={library.error}
          selectedId={selectedId}
          collapsed={materialsCollapsed}
          onToggleCollapsed={() => setMaterialsCollapsed((collapsed) => !collapsed)}
          onSelect={handleSelectMaterial}
          onEdit={(item) => setEditing(item.lecture)}
          onDelete={(item) => setDeleting(item.lecture)}
          onRetry={handleRetry}
          onDismissUpload={library.dismissUpload}
          onReload={() => library.refresh()}
          onUploadClick={() => setUploadOpen(true)}
        />

        {/*
          Centre panel: NotebookPage or ExamPage, depending on the URL (see router.jsx).
          While a lecture is open it is only hidden, not removed, so closing the lecture brings
          back the notebook or exam exactly as it was (e.g. the chosen exam answer).
        */}
        <div className="center-slot" hidden={openMaterial !== null}>
          <Outlet context={{ notebookState, kernel, kernelState }} />
        </div>
        {centre}

        <StudyAssistantPanel
          materials={materials}
          available={library.features ? library.features.ai : null}
          onAttachClick={() => setUploadOpen(true)}
          onOpenReference={handleOpenReference}
        />
      </div>

      {uploadOpen && <UploadDialog basic={basic} onCancel={() => setUploadOpen(false)} onUpload={handleUpload} />}
      {editing && <EditLectureDialog lecture={editing} titleOnly={basic} onSave={handleSave} onCancel={() => setEditing(null)} />}
      {deleting && <DeleteLectureDialog lecture={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
