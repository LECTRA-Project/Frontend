import { useCallback, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import SplitDivider from "./components/SplitDivider.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import UploadDialog from "../files/UploadDialog.jsx";
import PdfViewerPanel from "../files/PdfViewerPanel.jsx";
import MaterialViewerPanel from "../files/MaterialViewerPanel.jsx";
import { useCourseMaterials } from "../files/useCourseMaterials.js";
import { useAuth } from "../auth/authContext.js";
import { useNotebook } from "../notebook/useNotebook.js";
import { usePythonKernel } from "../notebook/usePythonKernel.js";
import { cellContextLabel, isSameCellContext } from "../../services/notebook/cellContext.js";
import "./workspace.css";

const UPLOAD_NOTES = {
  materials: "Files are saved in this browser only — they are not uploaded to the LECTRA server.",
  assistant: "Files stay in this browser tab only — they are not uploaded or saved yet.",
};

/*
  The main study workspace:
    header on top, then three columns —
    Course materials | Notebook, Exam, Home or file viewer | Study assistant

  A PDF opened over the notebook shows in a split view: the PDF above, the notebook
  below, with a draggable divider. The notebook stays mounted throughout, so opening,
  switching or closing PDFs never resets its cells, outputs or kernel.

  This component owns the state that several parts share:
    - whether the upload dialog is open
    - which uploaded file (PDF, notes, slides) is open in the centre panel
    - the student's uploaded course materials (saved in this browser, see useCourseMaterials)
    - files attached to the assistant message, and notebook cells added to it as context
    - the notebook (cells, outputs, run queue) and its Python kernel, so they survive
      switching to the Exam view and back
*/
export default function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userKey = user?.id ?? user?.email ?? "signed-in-user";

  const [selectedId, setSelectedId] = useState(null);
  const [materialsCollapsed, setMaterialsCollapsed] = useState(true);
  const [uploadTarget, setUploadTarget] = useState(null); // null | "materials" | "assistant"
  // The file shown in the centre panel, plus the URL it was opened on:
  // { material, path } or null. It only shows while the URL is unchanged, so using the
  // Exam button or "Back to notebook" leaves the viewer automatically.
  const [openFile, setOpenFile] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null); // material waiting for confirmation
  const [attachments, setAttachments] = useState([]); // files attached to the next assistant message
  const [cellContext, setCellContext] = useState([]); // notebook cells added to the next assistant message
  const [cellDragActive, setCellDragActive] = useState(false); // a cell is being dragged
  const [cellDragOver, setCellDragOver] = useState(false); // a touch/pen drag is over the assistant
  const [draftAnnouncement, setDraftAnnouncement] = useState({ text: "", seq: 0 });
  const [pdfShare, setPdfShare] = useState(0.5); // split view: fraction of the height for the PDF
  const [resizingSplit, setResizingSplit] = useState(false);
  const centerRef = useRef(null);
  const courseMaterials = useCourseMaterials(userKey);
  const { kernel, kernelState } = usePythonKernel();
  const notebookState = useNotebook(kernel, userKey);

  const viewerIsOpen = openFile !== null && openFile.path === location.pathname;
  const splitView = viewerIsOpen && openFile.material.type === "pdf" && location.pathname === "/workspace";

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

  function handleSelectMaterial(material) {
    setSelectedId(material.id);
    if (material.type === "notebook") {
      setOpenFile(null);
      if (location.pathname !== "/workspace") navigate("/workspace");
      notebookState.actions.openFile(material.file);
    } else if (material.type === "pdf" && location.pathname !== "/workspace/exam") {
      // PDFs open above the notebook (split view); from Home, go to the notebook first.
      if (location.pathname !== "/workspace") navigate("/workspace");
      setOpenFile({ material, path: "/workspace" });
    } else {
      // Show (or switch to) this file in place of the centre view (e.g. over the Exam).
      setOpenFile({ material, path: location.pathname });
    }
  }

  function browseMaterials() {
    setMaterialsCollapsed(false);
    requestAnimationFrame(() => {
      const panel = document.querySelector(".materials");
      panel?.scrollIntoView?.({ block: "nearest" });
      panel?.querySelector(".material-row, .materials__bottom button")?.focus();
    });
  }

  const home = {
    materials: courseMaterials.materials,
    status: courseMaterials.status,
    onUploadClick: () => setUploadTarget("materials"),
    onBrowseMaterials: browseMaterials,
    onOpenMaterial: handleSelectMaterial,
  };

  async function handleUpload(files) {
    const target = uploadTarget;
    setUploadTarget(null);
    if (target === "assistant") {
      setAttachments((list) => [...list, ...files.map((file) => ({ id: crypto.randomUUID(), name: file.name, file }))]);
    } else {
      await courseMaterials.addFiles(files);
    }
  }

  async function confirmRemoval() {
    const material = pendingRemoval;
    setPendingRemoval(null);
    const removed = await courseMaterials.removeMaterial(material);
    if (!removed) return;
    if (openFile?.material.id === material.id) setOpenFile(null);
    if (selectedId === material.id) setSelectedId(null);
  }

  return (
    <div className="workspace">
      <WorkspaceHeader />

      <div className={`workspace__body ${materialsCollapsed ? "workspace__body--materials-collapsed" : ""}`}>
        <CourseMaterialsPanel
          materials={courseMaterials.materials}
          status={courseMaterials.status}
          persistent={courseMaterials.persistent}
          error={courseMaterials.error}
          selectedId={selectedId}
          collapsed={materialsCollapsed}
          onToggleCollapsed={() => setMaterialsCollapsed((collapsed) => !collapsed)}
          onSelect={handleSelectMaterial}
          onRemove={setPendingRemoval}
          onUploadClick={() => setUploadTarget("materials")}
          onDismissError={courseMaterials.dismissError}
        />

        {/*
          Centre panel: NotebookPage, ExamPage or HomePage, depending on the URL (see router.jsx).
          The Outlet always stays at the same place in the tree so it is never remounted:
          - split view: the PDF and divider are shown above it;
          - other files: it is only hidden, so closing the file brings back the notebook
            or exam exactly as it was (e.g. the chosen exam answer).
          `center-area` adds no box of its own except in split view.
        */}
        <div
          ref={centerRef}
          className={`center-area ${splitView ? "center-area--split" : ""} ${resizingSplit ? "center-area--resizing" : ""}`}
          style={splitView ? { "--split-pdf": `${pdfShare}fr`, "--split-notebook": `${1 - pdfShare}fr` } : undefined}
        >
          {/* `key` resets page and zoom when another file is selected. */}
          {splitView && (
            <PdfViewerPanel key={openFile.material.id} material={openFile.material} onCollapse={() => setOpenFile(null)} />
          )}
          {splitView && (
            <SplitDivider share={pdfShare} onChange={setPdfShare} containerRef={centerRef} onResizing={setResizingSplit} />
          )}
          <div className="center-slot" hidden={viewerIsOpen && !splitView}>
            <Outlet context={{ notebookState, kernel, kernelState, assistantDraft, home }} />
          </div>
          {viewerIsOpen &&
            !splitView &&
            (openFile.material.type === "pdf" ? (
              <PdfViewerPanel key={openFile.material.id} material={openFile.material} onCollapse={() => setOpenFile(null)} />
            ) : (
              <MaterialViewerPanel key={openFile.material.id} material={openFile.material} onCollapse={() => setOpenFile(null)} />
            ))}
        </div>

        <StudyAssistantPanel
          attachments={attachments}
          cellContext={cellContext}
          cellDragActive={cellDragActive}
          cellDragOver={cellDragOver}
          announcement={draftAnnouncement}
          onAttachClick={() => setUploadTarget("assistant")}
          onRemoveAttachment={(id) => setAttachments((list) => list.filter((file) => file.id !== id))}
          onAddCell={addCellToDraft}
          onRemoveCell={removeCellFromDraft}
          onSent={({ attachmentIds, cellIds }) => {
            setAttachments((list) => list.filter((file) => !attachmentIds.includes(file.id)));
            setCellContext((list) => list.filter((item) => !cellIds.includes(item.id)));
          }}
        />
      </div>

      {uploadTarget && (
        <UploadDialog note={UPLOAD_NOTES[uploadTarget]} onCancel={() => setUploadTarget(null)} onUpload={handleUpload} />
      )}
      {pendingRemoval && (
        <ConfirmDialog
          title={`Remove “${pendingRemoval.name}”?`}
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        >
          <p>The file will be deleted from your course materials in this browser. This can’t be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
