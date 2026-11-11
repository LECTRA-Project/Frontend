import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import UploadDialog from "../files/UploadDialog.jsx";
import PdfViewerPanel from "../files/PdfViewerPanel.jsx";
import MaterialViewerPanel from "../files/MaterialViewerPanel.jsx";
import { useCourseMaterials } from "../files/useCourseMaterials.js";
import { useAuth } from "../auth/authContext.js";
import { useNotebook } from "../notebook/useNotebook.js";
import { usePythonKernel } from "../notebook/usePythonKernel.js";
import "./workspace.css";

const UPLOAD_NOTES = {
  materials: "Files are saved in this browser only — they are not uploaded to the LECTRA server.",
  assistant: "Files stay in this browser tab only — they are not uploaded or saved yet.",
};

/*
  The main study workspace:
    header on top, then three columns —
    Course materials | Notebook, Exam or file viewer | Study assistant

  This component owns the state that several parts share:
    - whether the upload dialog is open
    - which uploaded file (PDF, notes, slides) is open in the centre panel
    - the student's uploaded course materials (saved in this browser, see useCourseMaterials)
    - files attached to the assistant message
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
  const courseMaterials = useCourseMaterials(userKey);
  const { kernel, kernelState } = usePythonKernel();
  const notebookState = useNotebook(kernel, userKey);

  const viewerIsOpen = openFile !== null && openFile.path === location.pathname;

  function handleSelectMaterial(material) {
    setSelectedId(material.id);
    if (material.type === "notebook") {
      setOpenFile(null);
      if (location.pathname !== "/workspace") navigate("/workspace");
      notebookState.actions.openFile(material.file);
    } else {
      // Show (or switch to) this PDF, notes or slides file in the centre panel.
      setOpenFile({ material, path: location.pathname });
    }
  }

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
          Centre panel: NotebookPage or ExamPage, depending on the URL (see router.jsx).
          While a file is open it is only hidden, not removed, so closing the file brings
          back the notebook or exam exactly as it was (e.g. the chosen exam answer).
        */}
        <div className="center-slot" hidden={viewerIsOpen}>
          <Outlet context={{ notebookState, kernel, kernelState }} />
        </div>
        {/* `key` resets page and zoom when another file is selected. */}
        {viewerIsOpen &&
          (openFile.material.type === "pdf" ? (
            <PdfViewerPanel key={openFile.material.id} material={openFile.material} onCollapse={() => setOpenFile(null)} />
          ) : (
            <MaterialViewerPanel key={openFile.material.id} material={openFile.material} onCollapse={() => setOpenFile(null)} />
          ))}

        <StudyAssistantPanel
          attachments={attachments}
          onAttachClick={() => setUploadTarget("assistant")}
          onClearAttachments={() => setAttachments([])}
          onRemoveAttachment={(id) => setAttachments((list) => list.filter((file) => file.id !== id))}
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
