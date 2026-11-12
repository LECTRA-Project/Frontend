import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import CourseMaterialsPanel from "./components/CourseMaterialsPanel.jsx";
import StudyAssistantPanel from "./components/StudyAssistantPanel.jsx";
import SplitDivider from "./components/SplitDivider.jsx";
import ColumnDivider from "./components/ColumnDivider.jsx";
import SectionHandle from "./components/SectionHandle.jsx";
import {
  computeGrid,
  DEFAULT_LAYOUT,
  loadLayout,
  minimumWidth,
  moveSection,
  placeSection,
  resizeColumns,
  saveLayout,
  sameLayout,
  SECTION_LABELS,
} from "./sectionLayout.js";
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
import { cellContextLabel, isOverCellDropZone, isSameCellContext } from "../../services/notebook/cellContext.js";
import { fileNameOf, materialContextProblem, toMaterialContext } from "./materialContext.js";
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

  A PDF opened from the workspace shows next to the notebook (by default: Course materials |
  PDF | Notebook | Study assistant, side by side); the dividers between columns resize them
  (ColumnDivider + resizeColumns). If the student stacks the PDF and notebook in one column,
  a horizontal divider sizes the two instead. The notebook stays mounted throughout, so opening,
  switching or closing PDFs never resets its cells, outputs or kernel. Home has no Study
  assistant; opening a material from Home goes to the workspace (/workspace) first.
  The header's menu button opens the Course materials menu as a drawer over the workspace
  (the rest is dimmed; a click outside, Escape or opening a material closes it). It is not
  part of the section grid, and Home has no menu.

  The four sections (Course materials, PDF viewer, Notebook, Study assistant) can be
  rearranged by dragging the grip in their header or with its Move menu (see
  sectionLayout.js and SectionHandle). Each section is rendered once, in a fixed place in
  the DOM; only its CSS grid position changes, so moving it never resets its state. When
  the arrangement can't fit the window, the sections stack in one column, in layout order.

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

  Course materials can be dragged from their panel onto the Study assistant (or added with
  the keyboard from a row's grip); they are sent with the next message as the lectures to
  answer from (see materialContext.js). Dropping never opens, moves or changes a material.

  This component owns the state shared between the panels: the open lecture, its fetched
  file, the dialogs, the notebook cells and materials added to the assistant message, and the notebook
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
  // The Course materials menu: a drawer over the workspace (not on Home), opened from the header.
  const [materialsOpen, setMaterialsOpen] = useState(false);
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
  const [pdfShare, setPdfShare] = useState(0.5); // PDF stacked over the notebook: its fraction of the height
  const [columnWidths, setColumnWidths] = useState({}); // set by the column dividers (see resizeColumns)
  const columnDrag = useRef(null); // { left, right, widths } measured when a divider drag starts
  const [resizingSplit, setResizingSplit] = useState(false);
  const pairRef = useRef(null); // spans the PDF + notebook pair, for the divider's drag maths
  const bodyRef = useRef(null);
  const [sectionLayout, setSectionLayout] = useState(() => loadLayout(userKey));
  const [stacked, setStacked] = useState(false); // all sections in one column (narrow window)
  // A section being dragged: { section, x, y, target: { id, edge } | null }
  const [sectionDrag, setSectionDrag] = useState(null);
  const sectionDragRef = useRef(null);
  const [layoutAnnouncement, setLayoutAnnouncement] = useState({ text: "", seq: 0 });

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

  /* ---------- Course materials as assistant context ---------- */
  const [materialContext, setMaterialContext] = useState([]); // materials added to the next message
  // A material being dragged: { material, x, y, over, problem }
  const [materialDrag, setMaterialDrag] = useState(null);
  const materialDragRef = useRef(null);

  /* Adds a material to the draft; refuses (with the reason) what the assistant can't read. */
  function addMaterialToDraft(material) {
    const problem = materialContextProblem(material);
    if (problem) {
      setNotice(problem);
      announce(problem);
      return false;
    }
    const item = toMaterialContext(material);
    if (materialContext.some((existing) => existing.lectureId === item.lectureId)) {
      announce(`${item.fileName} is already in your message to the study assistant.`);
      return false;
    }
    setMaterialContext((list) => [...list, item]);
    announce(`${item.fileName} added to your message to the study assistant.`);
    return true;
  }

  function removeMaterialFromDraft(id) {
    const item = materialContext.find((existing) => existing.id === id);
    if (!item) return;
    setMaterialContext((list) => list.filter((existing) => existing.id !== id));
    announce(`${item.fileName} removed from your message.`);
  }

  function finishMaterialDrag(point) {
    const drag = materialDragRef.current;
    if (!drag) return;
    materialDragRef.current = null;
    setMaterialDrag(null);
    if (point && isOverCellDropZone(point.x, point.y)) addMaterialToDraft(drag.material);
    else announce(`${fileNameOf(drag.material)} was not added to your message.`);
  }

  const materialDragApi = {
    start(material, point) {
      materialDragRef.current = { material };
      setMaterialDrag({ material, ...point, over: isOverCellDropZone(point.x, point.y), problem: materialContextProblem(material) });
    },
    move(point) {
      if (!materialDragRef.current) return;
      const over = isOverCellDropZone(point.x, point.y);
      setMaterialDrag((drag) => drag && { ...drag, ...point, over });
    },
    end: (point) => finishMaterialDrag(point),
    cancel: () => finishMaterialDrag(null),
    add(material) {
      if (addMaterialToDraft(material)) {
        setMaterialsOpen(false);
        requestAnimationFrame(() => document.getElementById("composer-input")?.focus());
      }
    },
  };

  // Escape closes the materials menu (not while a dialog or a drag is open — Escape is theirs then).
  useEffect(() => {
    if (!materialsOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || materialDragRef.current || document.querySelector('[role="dialog"]')) return;
      setMaterialsOpen(false);
      document.querySelector('[aria-controls="course-materials"]')?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [materialsOpen]);

  // Escape cancels a material drag.
  useEffect(() => {
    if (!materialDrag) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") finishMaterialDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const assistantDraft = useMemo(
    () => ({
      addCell: addCellToDraft,
      setDragActive: setCellDragActive,
      setDragOver: setCellDragOver,
      focusComposer: () => document.getElementById("composer-input")?.focus(),
    }),
    [addCellToDraft]
  );

  const isHome = location.pathname === "/workspace/home";
  const drawerOpen = materialsOpen && !isHome;
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
    // Home only lists materials: opening one goes to the workspace (PDFs open above the notebook).
    if (location.pathname === "/workspace/home") {
      navigate("/workspace");
      setOpen({ lectureId, path: "/workspace", focus });
      return;
    }
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
    setMaterialsOpen(false); // the drawer covers the workspace; get it out of the way
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
    if (!isHome) setMaterialsOpen(true); // show the upload progress
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

  /* ---------- Section arrangement ---------- */
  // The materials menu is hidden while collapsed (the header's menu button toggles it);
  // Home has no Study assistant.
  const visibleSections = new Set([
    "notebook",
    ...(isHome ? [] : ["assistant"]),
    ...(splitView ? ["pdf"] : []),
  ]);
  const grid = computeGrid(sectionLayout, { visible: visibleSections, pdfShare, widths: columnWidths });
  const gridKey = JSON.stringify([grid.columns, grid.maxStack]);
  const gridRef = useRef(grid);
  gridRef.current = grid;

  // Stack the sections when the arrangement needs more room than the window has.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const measure = () => {
      const { columns, maxStack } = gridRef.current;
      if (window.matchMedia?.("(max-width: 880px)").matches) return setStacked(true);
      const width = body.clientWidth;
      if (!width) return setStacked(false); // not laid out (e.g. tests): keep the grid
      const style = getComputedStyle(body);
      const px = (name, fallback) => parseFloat(style.getPropertyValue(name)) || fallback;
      const needed = minimumWidth(columns, {
        materials: px("--ws-materials-w", 280),
        assistant: px("--ws-assistant-w", 340),
        flexMin: 240,
        gap: 16,
        padding: 16,
      });
      // Height from the viewport, not the body: a stacked body grows with its content.
      const available = window.innerHeight - body.getBoundingClientRect().top - 32 - 16 * (maxStack - 1);
      setStacked(width < needed || available / maxStack < 160);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(body);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [gridKey]);

  const announceLayout = useCallback(
    (text) => setLayoutAnnouncement((previous) => ({ text, seq: previous.seq + 1 })),
    []
  );

  function applyLayout(next, message) {
    setSectionLayout(next);
    saveLayout(userKey, next);
    announceLayout(message);
  }

  const EDGE_TEXT = { left: "to the left of", right: "to the right of", top: "above", bottom: "below" };

  function dropTargetAt({ x, y }) {
    const zone = document.elementFromPoint?.(x, y)?.closest?.("[data-drop-edge]");
    return zone ? { id: zone.dataset.dropTarget, edge: zone.dataset.dropEdge } : null;
  }

  function finishSectionDrag(target) {
    const drag = sectionDragRef.current;
    if (!drag) return;
    sectionDragRef.current = null;
    setSectionDrag(null);
    const label = SECTION_LABELS[drag.section];
    const next = target ? placeSection(sectionLayout, drag.section, target.id, target.edge) : null;
    if (next) applyLayout(next, `${label} moved ${EDGE_TEXT[target.edge]} ${SECTION_LABELS[target.id]}.`);
    else announceLayout(`${label} was not moved.`);
  }

  const sections = {
    menuItems(section) {
      const move = (direction, label, icon) => {
        const next = moveSection(sectionLayout, section, direction, visibleSections);
        return {
          label,
          icon,
          disabled: !next,
          onSelect: () => next && applyLayout(next, `${SECTION_LABELS[section]} moved ${direction}.`),
        };
      };
      return [
        move("left", "Move left", "arrowLeft"),
        move("right", "Move right", "arrowRight"),
        move("up", "Move up", "arrowUp"),
        move("down", "Move down", "arrowDown"),
        "separator",
        {
          label: "Reset layout",
          icon: "restart",
          disabled: sameLayout(sectionLayout, DEFAULT_LAYOUT),
          onSelect: () => applyLayout(DEFAULT_LAYOUT, "Workspace layout reset."),
        },
      ];
    },
    startDrag(section, point) {
      sectionDragRef.current = { section };
      setSectionDrag({ section, ...point, target: null });
    },
    moveDrag(point) {
      if (!sectionDragRef.current) return;
      const target = dropTargetAt(point);
      setSectionDrag((drag) => drag && { ...drag, ...point, target });
    },
    endDrag(point) {
      finishSectionDrag(dropTargetAt(point));
    },
    cancelDrag() {
      finishSectionDrag(null);
    },
  };

  // Escape cancels a section drag; the section stays where it was.
  useEffect(() => {
    if (!sectionDrag) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") finishSectionDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handleFor = (section) => <SectionHandle section={section} sections={sections} />;

  function slotProps(section, extraClass = "") {
    const place = grid.place[section];
    const classes = [
      "ws-slot",
      place?.compact ? "ws-slot--compact" : "",
      sectionDrag?.section === section ? "ws-slot--dragging" : "",
      extraClass,
    ];
    return {
      className: classes.filter(Boolean).join(" "),
      "data-section": section,
      hidden: !visibleSections.has(section),
      style: place
        ? { "--slot-column": place.column, "--slot-row": `${place.rowStart} / ${place.rowEnd}`, "--slot-order": grid.order[section] }
        : undefined,
    };
  }

  /* Drop zones over a section while another one is dragged; only edges that make sense. */
  function dropOverlay(section) {
    if (!sectionDrag || sectionDrag.section === section || !visibleSections.has(section)) return null;
    const edges = (stacked ? ["top", "bottom"] : ["left", "right", "top", "bottom"]).filter((edge) =>
      placeSection(sectionLayout, sectionDrag.section, section, edge)
    );
    const active = sectionDrag.target?.id === section ? sectionDrag.target.edge : null;
    return (
      <div className="section-drop" aria-hidden="true">
        {edges.map((edge) => (
          <div
            key={edge}
            className={`section-drop__zone section-drop__zone--${edge} ${active === edge ? "section-drop__zone--active" : ""}`}
            data-drop-target={section}
            data-drop-edge={edge}
          />
        ))}
        {active && (
          <span className="section-drop__label">
            Place {EDGE_TEXT[active]} {SECTION_LABELS[section]}
          </span>
        )}
      </div>
    );
  }

  const divider = !stacked ? grid.divider : null;

  /* Rendered width of a grid column (its first section's slot). */
  const measureColumn = (spec) => ({
    key: spec.key,
    flex: spec.flex,
    width: document.querySelector(`[data-section="${spec.members[0]}"]`)?.getBoundingClientRect().width || 0,
  });

  // Dragging a column divider: widths are measured at the start, then dx is applied to them.
  function handleColumnResize(index, dx, phase) {
    const left = grid.columns[index];
    const right = grid.columns[index + 1];
    if (phase !== "move" || !columnDrag.current) {
      columnDrag.current = { left: measureColumn(left), right: measureColumn(right), widths: columnWidths };
    }
    const start = columnDrag.current;
    if (start.left.width + start.right.width === 0) return; // not laid out
    setColumnWidths(resizeColumns(start.widths, start.left, start.right, dx));
    if (phase === "key") columnDrag.current = null;
  }

  const columnDividers = stacked
    ? []
    : grid.columns.slice(0, -1).map((spec, index) => (
        <ColumnDivider
          key={`${spec.key}|${grid.columns[index + 1].key}`}
          leftLabel={spec.members.map((id) => SECTION_LABELS[id]).join(" / ")}
          rightLabel={grid.columns[index + 1].members.map((id) => SECTION_LABELS[id]).join(" / ")}
          onResize={(dx, phase) => handleColumnResize(index, dx, phase)}
          onResizing={(active) => {
            if (!active) columnDrag.current = null;
            setResizingSplit(active);
          }}
          style={{ "--slot-column": index + 1 }}
        />
      ));

  const home = {
    materials,
    loading: library.loading,
    onUploadClick: () => setUploadOpen(true),
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
        handle={splitView ? handleFor("pdf") : null}
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
    <div className={`workspace ${stacked ? "workspace--stacked" : ""}`}>
      <WorkspaceHeader
        materialsOpen={drawerOpen}
        onToggleMaterials={isHome ? null : () => setMaterialsOpen((value) => !value)}
      />

      {notice && (
        <TransientStatus key={notice} duration={4000} onDismiss={() => setNotice(null)}>
          <p className="workspace__notice" role="status">
            {notice}
          </p>
        </TransientStatus>
      )}

      <div
        ref={bodyRef}
        className={[
          "workspace__body",
          stacked ? "workspace__body--stacked" : "",
          sectionDrag ? "workspace__body--section-dragging" : "",
          resizingSplit ? "workspace__body--resizing" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ "--ws-columns": grid.columns.map((column) => column.track).join(" "), "--ws-rows": grid.rows.join(" ") }}
      >
        {/* PDF viewer section: only shown while a PDF is open over the notebook (split view). */}
        <div {...slotProps("pdf")}>
          {splitView && centre}
          {dropOverlay("pdf")}
        </div>

        {/*
          Notebook section: NotebookPage, ExamPage or HomePage, depending on the URL (see
          router.jsx). The Outlet always stays at the same place in the tree so it is never
          remounted. Other open lectures (and PDFs over the Exam) are shown here in its place;
          the Outlet is then only hidden, so closing the lecture brings back the notebook or
          exam exactly as it was (e.g. the chosen exam answer).
        */}
        <div {...slotProps("notebook")}>
          <div className="center-slot" hidden={openMaterial !== null && !splitView}>
            <Outlet context={{ notebookState, kernel, kernelState, assistantDraft, home, notebookHandle: handleFor("notebook") }} />
          </div>
          {!splitView && centre}
          {dropOverlay("notebook")}
        </div>

        <div {...slotProps("assistant")}>
          <StudyAssistantPanel
            materials={materials}
            chat={library.features?.chat === true}
            focusLectureId={openMaterial?.id ?? null}
            onOpenLecture={(lectureId) => {
              const material = materials.find((item) => item.id === lectureId);
              if (material) handleSelectMaterial(material);
            }}
            available={library.features ? library.features.ai || library.features.chat : null}
            onAttachClick={() => setUploadOpen(true)}
            onOpenReference={handleOpenReference}
            cellContext={cellContext}
            cellDragActive={cellDragActive}
            cellDragOver={cellDragOver}
            announcement={draftAnnouncement}
            onAddCell={addCellToDraft}
            onRemoveCell={removeCellFromDraft}
            materialContext={materialContext}
            materialDrag={
              materialDrag && {
                fileName: fileNameOf(materialDrag.material),
                over: materialDrag.over,
                problem: materialDrag.problem,
              }
            }
            onRemoveMaterial={removeMaterialFromDraft}
            onSent={({ cellIds, materialIds = [] }) => {
              setCellContext((list) => list.filter((item) => !cellIds.includes(item.id)));
              setMaterialContext((list) => list.filter((item) => !materialIds.includes(item.id)));
            }}
            handle={handleFor("assistant")}
          />
          {dropOverlay("assistant")}
        </div>

        {/* Dividers between side-by-side columns: drag to resize. */}
        {columnDividers}

        {/* PDF / notebook divider, when the two are stacked next to each other. */}
        {divider && (
          <div
            ref={pairRef}
            className="ws-pair-measure"
            aria-hidden="true"
            style={{ "--slot-column": divider.column, "--slot-row": `${divider.pairStart} / ${divider.pairEnd}` }}
          />
        )}
        {divider && (
          <SplitDivider
            share={divider.upper === "pdf" ? pdfShare : 1 - pdfShare}
            upperLabel={divider.upper === "pdf" ? "PDF" : "Notebook"}
            onChange={(share) => setPdfShare(divider.upper === "pdf" ? share : 1 - share)}
            containerRef={pairRef}
            onResizing={setResizingSplit}
            style={{ "--slot-column": divider.column, "--slot-row": `${divider.rowStart} / ${divider.rowEnd}` }}
          />
        )}
      </div>

      {drawerOpen && (
        <>
          {/* Dims the workspace; clicking it closes the menu. See-through while a material is dragged to the assistant. */}
          <div
            className={`materials-backdrop ${materialDrag ? "materials-backdrop--dragging" : ""}`}
            aria-hidden="true"
            onClick={() => setMaterialsOpen(false)}
          />
          <div className="materials-drawer" data-section="materials">
            <CourseMaterialsPanel
              materials={materials}
              uploads={library.uploads}
              loading={library.loading}
              error={library.error}
              selectedId={selectedId}
              onSelect={handleSelectMaterial}
              onEdit={(item) => setEditing(item.lecture)}
              onDelete={(item) => setDeleting(item.lecture)}
              onRetry={handleRetry}
              onDismissUpload={library.dismissUpload}
              onReload={() => library.refresh()}
              onUploadClick={() => setUploadOpen(true)}
              onClose={() => setMaterialsOpen(false)}
              materialDrag={materialDragApi}
            />
          </div>
        </>
      )}

      <p className="visually-hidden" role="status">
        <span key={layoutAnnouncement.seq}>{layoutAnnouncement.text}</span>
      </p>
      {materialDrag && (
        <div className="section-ghost" style={{ left: materialDrag.x, top: materialDrag.y }} aria-hidden="true">
          {fileNameOf(materialDrag.material)}
        </div>
      )}
      {sectionDrag && (
        <div className="section-ghost" style={{ left: sectionDrag.x, top: sectionDrag.y }} aria-hidden="true">
          Moving {SECTION_LABELS[sectionDrag.section]}
        </div>
      )}

      {uploadOpen && <UploadDialog basic={basic} onCancel={() => setUploadOpen(false)} onUpload={handleUpload} />}
      {editing && <EditLectureDialog lecture={editing} titleOnly={basic} onSave={handleSave} onCancel={() => setEditing(null)} />}
      {deleting && <DeleteLectureDialog lecture={deleting} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
