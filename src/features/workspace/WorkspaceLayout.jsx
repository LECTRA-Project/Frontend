import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import UploadDialog from "../files/UploadDialog.jsx";
import PdfViewerPanel from "../files/PdfViewerPanel.jsx";
import { SAMPLE_MATERIALS } from "../../data/sampleMaterials.js";
import "./workspace.css";

/* The blank cells the notebook starts with (no content, only placeholders). */
const STARTING_CELLS = [
  { id: "cell-1", type: "markdown", value: "" },
  { id: "cell-2", type: "code", value: "" },
  { id: "cell-3", type: "markdown", value: "" },
  { id: "cell-4", type: "code", value: "" },
];

/* Works out which material group a picked file belongs to, from its extension. */
function typeFromFileName(name) {
  const extension = name.split(".").pop().toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "pptx" || extension === "ppt") return "slides";
  if (extension === "ipynb") return "notebook";
  return "notes";
}

/*
  The main study workspace:
    header on top, then three columns —
    Course materials | Notebook, Exam or PDF viewer | Study assistant

  This component owns the state that several parts share:
    - whether the upload dialog is open
    - which PDF is open in the centre panel
    - files picked this session (kept only in the browser, never uploaded)
    - files attached to the assistant message
    - the notebook cells
*/
export default function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedId, setSelectedId] = useState("notebook-01");
  const [uploadTarget, setUploadTarget] = useState(null); // null | "materials" | "assistant"
  // The PDF shown inline in the centre panel, plus the URL it was opened on:
  // { material, path } or null. It only shows while the URL is unchanged, so using the
  // Exam button or "Back to notebook" leaves the PDF view automatically.
  const [openPdf, setOpenPdf] = useState(null);
  const [sessionFiles, setSessionFiles] = useState([]); // files picked in the upload dialog
  const [attachments, setAttachments] = useState([]); // files attached to the next assistant message
  const [cells, setCells] = useState(STARTING_CELLS);

  // Free the temporary browser URLs of picked files when leaving the workspace.
  const sessionFilesRef = useRef(sessionFiles);
  useEffect(() => {
    sessionFilesRef.current = sessionFiles;
  }, [sessionFiles]);
  useEffect(() => () => sessionFilesRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  const materials = [...SAMPLE_MATERIALS, ...sessionFiles];

  const pdfIsOpen = openPdf !== null && openPdf.path === location.pathname;

  function handleSelectMaterial(material) {
    setSelectedId(material.id);
    if (material.type === "pdf") {
      // Show (or switch to) this PDF in the centre panel.
      setOpenPdf({ material, path: location.pathname });
    } else if (material.type === "notebook") {
      setOpenPdf(null);
      if (location.pathname !== "/workspace") navigate("/workspace");
    }
  }

  function handleUpload(files) {
    const picked = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      file,
    }));

    if (uploadTarget === "assistant") {
      setAttachments((list) => [...list, ...picked]);
    } else {
      const newMaterials = picked.map((item) => ({
        ...item,
        type: typeFromFileName(item.name),
        meta: "Added this session · not saved",
        url: URL.createObjectURL(item.file), // lets the PDF viewer show the real file
      }));
      setSessionFiles((list) => [...list, ...newMaterials]);
    }
    setUploadTarget(null);
  }

  return (
    <div className="workspace">
      <WorkspaceHeader />

      <div className="workspace__body">
        <CourseMaterialsPanel
          materials={materials}
          selectedId={selectedId}
          onSelect={handleSelectMaterial}
          onUploadClick={() => setUploadTarget("materials")}
        />

        {/*
          Centre panel: NotebookPage or ExamPage, depending on the URL (see router.jsx).
          While a PDF is open it is only hidden, not removed, so collapsing the PDF brings
          back the notebook or exam exactly as it was (e.g. the chosen exam answer).
        */}
        <div className="center-slot" hidden={pdfIsOpen}>
          <Outlet context={{ cells, setCells }} />
        </div>
        {pdfIsOpen && (
          // `key` resets page and zoom when another PDF is selected.
          <PdfViewerPanel key={openPdf.material.id} material={openPdf.material} onCollapse={() => setOpenPdf(null)} />
        )}

        <StudyAssistantPanel
          attachments={attachments}
          onAttachClick={() => setUploadTarget("assistant")}
          onClearAttachments={() => setAttachments([])}
          onRemoveAttachment={(id) => setAttachments((list) => list.filter((file) => file.id !== id))}
        />
      </div>

      {uploadTarget && <UploadDialog onCancel={() => setUploadTarget(null)} onUpload={handleUpload} />}
    </div>
  );
}
