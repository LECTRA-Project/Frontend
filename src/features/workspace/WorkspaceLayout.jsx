import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import UploadDialog from "../files/UploadDialog.jsx";
import PdfViewerPanel from "../files/PdfViewerPanel.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import EditLectureDialog from "../lectures/EditLectureDialog.jsx";
import DeleteLectureDialog from "../lectures/DeleteLectureDialog.jsx";
import LectureContentPanel from "../lectures/LectureContentPanel.jsx";
import { toMaterial } from "../lectures/materialTypes.js";
import { useLectureLibrary } from "../lectures/useLectureLibrary.js";
import { fetchLectureFile } from "../../api/services/lectures.js";
import "./workspace.css";

/* The blank cells the notebook starts with (no content, only placeholders). */
const STARTING_CELLS = [
  { id: "cell-1", type: "markdown", value: "" },
  { id: "cell-2", type: "code", value: "" },
  { id: "cell-3", type: "markdown", value: "" },
  { id: "cell-4", type: "code", value: "" },
];

/*
  The main study workspace:
    header on top, then three columns —
    Course materials | Notebook, Exam or an open lecture | Study assistant

  Lecture materials come from the backend (useLectureLibrary). This component owns
  the state shared between the panels:
    - which lecture is open in the centre (and which page/slide/cell to show)
    - the open PDF's file, fetched with the auth token as a temporary blob URL
    - the upload / edit / delete dialogs
    - the notebook cells
*/
export default function WorkspaceLayout() {
  const location = useLocation();
  const library = useLectureLibrary();
  const materials = library.lectures.map(toMaterial);

  const [selectedId, setSelectedId] = useState(null);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState(null); // lecture
  const [deleting, setDeleting] = useState(null); // lecture
  const [notice, setNotice] = useState(null);
  const [cells, setCells] = useState(STARTING_CELLS);
  // The lecture shown in the centre, plus the URL it was opened on: it only shows while
  // the URL is unchanged, so the Exam button or "Back to notebook" leaves it automatically.
  // focus = { sourceType, sourceNumber } from a cited source.
  const [open, setOpen] = useState(null); // { lectureId, path, focus }
  const [pdfFile, setPdfFile] = useState(null); // { key, url, error }

  const openMaterial =
    open && open.path === location.pathname ? materials.find((item) => item.id === open.lectureId) ?? null : null;
  const openPdfKey = openMaterial?.type === "pdf" ? `${openMaterial.id}:${openMaterial.lecture.content_version}` : null;

  // Fetch the open PDF (the file endpoint needs the auth header, so an <iframe src> can't load it directly).
  useEffect(() => {
    if (!openPdfKey) return undefined;
    const [lectureId] = openPdfKey.split(":");
    const controller = new AbortController();
    let url = null;
    fetchLectureFile(lectureId, { signal: controller.signal }).then(
      (blob) => {
        url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "application/pdf" }));
        setPdfFile({ key: openPdfKey, url, error: null });
      },
      (err) => {
        if (!controller.signal.aborted) setPdfFile({ key: openPdfKey, url: null, error: err.message || "The PDF could not be loaded." });
      }
    );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [openPdfKey]);

  function openLecture(lectureId, focus = null) {
    setSelectedId(lectureId);
    setOpen({ lectureId, path: location.pathname, focus });
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

  const pdfMaterial =
    openMaterial?.type === "pdf"
      ? {
          ...openMaterial,
          url: pdfFile?.key === openPdfKey ? pdfFile.url : null,
          loading: pdfFile?.key !== openPdfKey,
          loadError: pdfFile?.key === openPdfKey ? pdfFile.error : null,
        }
      : null;
  // A cited page can be out of range after the file was replaced with a shorter one.
  const citedPage = open?.focus?.sourceType === "page" ? open.focus.sourceNumber : 1;
  const pdfPage = Math.max(1, Math.min(citedPage, openMaterial?.pages || citedPage));

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
          onSelect={(item) => openLecture(item.id)}
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
          <Outlet context={{ cells, setCells }} />
        </div>
        {pdfMaterial && (
          // `key` resets page and zoom when another PDF, version or cited page is opened.
          <PdfViewerPanel
            key={`${openPdfKey}:${pdfPage}`}
            material={pdfMaterial}
            initialPage={pdfPage}
            onCollapse={() => setOpen(null)}
          />
        )}
        {openMaterial && openMaterial.type !== "pdf" && (
          <LectureContentPanel
            key={openMaterial.id}
            lecture={openMaterial.lecture}
            focus={open.focus}
            onRetry={() => handleRetry(openMaterial)}
            onClose={() => setOpen(null)}
          />
        )}

        <StudyAssistantPanel
          materials={materials}
          onAttachClick={() => setUploadOpen(true)}
          onOpenReference={handleOpenReference}
        />
      </div>

      {uploadOpen && <UploadDialog onCancel={() => setUploadOpen(false)} onUpload={handleUpload} />}
      {editing && <EditLectureDialog lecture={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
      {deleting && <DeleteLectureDialog lecture={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
