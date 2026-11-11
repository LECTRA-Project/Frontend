import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import SplitDivider from "./components/SplitDivider.jsx";
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
import { cellContextLabel, isSameCellContext } from "../../services/notebook/cellContext.js";
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
    Course materials | Notebook, Exam, Home or an open lecture | Study assistant

  A PDF opened over the notebook shows in a split view: the PDF above, the notebook
  below, with a draggable divider. The notebook stays mounted throughout, so opening,
  switching or closing PDFs never resets its cells, outputs or kernel. Opening a PDF
  from Home goes to the notebook first.

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
  file, the dialogs, the notebook cells added to the assistant message, and the notebook
  with its kernel (so they survive switching to the Exam view and back).
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
  const [cellContext, setCellContext] = useState([]); // notebook cells added to the next assistant message
  const [cellDragActive, setCellDragActive] = useState(false); // a cell is being dragged
  const [cellDragOver, setCellDragOver] = useState(false); // a touch/pen drag is over the assistant
  const [draftAnnouncement, setDraftAnnouncement] = useState({ text: "", seq: 0 });
  const [pdfShare, setPdfShare] = useState(0.5); // split view: fraction of the height for the PDF
  const [resizingSplit, setResizingSplit] = useState(false);
  const centerRef = useRef(null);

  // Screen-reader feedback for the assistant draft; `seq` makes a repeated message announce again.
  const announce = useCallback((text) => setDraftAnnouncement((previous) => ({ text, seq: previous.seq + 1 })), []);

  /* Adds a cell snapshot (see services/notebook/cellContext.js) to the assistant draft. */
  const addCellToDraft = useCallback(
    (item) => {
      const label = cellContextLabel(item);
      if (cellContext.some((existing) => isSameCellContext(existing, item))) {
        announce(`${label} is already in your message to the study assistant.`);
        return;
      }
      setCellContext((list) => [...list, item]);
      announce(`${label} added to your message to the study assistant.`);
    },
    [cellContext, announce]
  );

  const removeCellFromDraft = useCallback(
    (id) => {
      const item = cellContext.find((existing) => existing.id === id);
      if (!item) return;
      setCellContext((list) => list.filter((existing) => existing.id !== id));
      announce(`${cellContextLabel(item)} removed from your message.`);
    },
    [cellContext, announce]
  );

  const assistantDraft = useMemo(
    () => ({
      addCell: addCellToDraft,
      setDragActive: setCellDragActive,
      setDragOver: setCellDragOver,
      focusComposer: () => document.getElementById("composer-input")?.focus(),
    }),
    [addCellToDraft]
  );

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
    const material = materials.find((item) => item.id === lectureId);
    const isPdfPage = material?.type === "pdf" && (focus?.sourceType ?? "page") === "page";
    if (isPdfPage && location.pathname === "/workspace/home") {
      // PDFs open above the notebook (split view), so go to the notebook first.
      navigate("/workspace");
      setOpen({ lectureId, path: "/workspace", focus });
      return;
    }
    setOpen({ lectureId, path: location.pathname, focus });
  }

  function browseMaterials() {
    setMaterialsCollapsed(false);
    requestAnimationFrame(() => {
      const panel = document.querySelector(".materials");
      panel?.scrollIntoView?.({ block: "nearest" });
      panel?.querySelector(".material-row, .materials__bottom button")?.focus();
    });
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

  // A PDF opened over the notebook is shown above it instead of replacing it.
  const splitView = openMaterial !== null && openMaterial.type === "pdf" && !showsSource && location.pathname === "/workspace";

  const home = {
    materials,
    loading: library.loading,
    onUploadClick: () => setUploadOpen(true),
    onBrowseMaterials: browseMaterials,
    onOpenMaterial: handleSelectMaterial,
  };

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
          Centre panel: NotebookPage, ExamPage or HomePage, depending on the URL (see router.jsx).
          The Outlet always stays at the same place in the tree so it is never remounted:
          - split view: the PDF and a divider are shown above the notebook;
          - other lectures: it is only hidden, so closing the lecture brings back the
            notebook or exam exactly as it was (e.g. the chosen exam answer).
          `center-area` adds no box of its own except in split view.
        */}
        <div
          ref={centerRef}
          className={`center-area ${splitView ? "center-area--split" : ""} ${resizingSplit ? "center-area--resizing" : ""}`}
          style={splitView ? { "--split-pdf": `${pdfShare}fr`, "--split-notebook": `${1 - pdfShare}fr` } : undefined}
        >
          {splitView && centre}
          {splitView && (
            <SplitDivider share={pdfShare} onChange={setPdfShare} containerRef={centerRef} onResizing={setResizingSplit} />
          )}
          <div className="center-slot" hidden={openMaterial !== null && !splitView}>
            <Outlet context={{ notebookState, kernel, kernelState, assistantDraft, home }} />
          </div>
          {!splitView && centre}
        </div>

        <StudyAssistantPanel
          materials={materials}
          available={library.features ? library.features.ai : null}
          onAttachClick={() => setUploadOpen(true)}
          onOpenReference={handleOpenReference}
          cellContext={cellContext}
          cellDragActive={cellDragActive}
          cellDragOver={cellDragOver}
          announcement={draftAnnouncement}
          onAddCell={addCellToDraft}
          onRemoveCell={removeCellFromDraft}
          onSent={({ cellIds }) => setCellContext((list) => list.filter((item) => !cellIds.includes(item.id)))}
        />
      </div>

      {uploadOpen && <UploadDialog basic={basic} onCancel={() => setUploadOpen(false)} onUpload={handleUpload} />}
      {editing && <EditLectureDialog lecture={editing} titleOnly={basic} onSave={handleSave} onCancel={() => setEditing(null)} />}
      {deleting && <DeleteLectureDialog lecture={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
