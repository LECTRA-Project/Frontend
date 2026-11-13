import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import WorkspaceHeader from "./components/WorkspaceHeader.jsx";
import ChatSidebar from "./components/ChatSidebar.jsx";
import ResizeHandle from "./components/ResizeHandle.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import NotebookPage from "./pages/NotebookPage.jsx";
import UploadDialog from "../files/UploadDialog.jsx";
import PdfViewerPanel from "../files/PdfViewerPanel.jsx";
import MaterialViewerPanel from "../files/MaterialViewerPanel.jsx";
import TransientStatus from "../../components/ui/TransientStatus.jsx";
import LectureContentPanel from "../lectures/LectureContentPanel.jsx";
import EditLectureDialog from "../lectures/EditLectureDialog.jsx";
import DeleteLectureDialog from "../lectures/DeleteLectureDialog.jsx";
import { toMaterial } from "../lectures/materialTypes.js";
import { useLectureLibrary } from "../lectures/useLectureLibrary.js";
import { useAuth } from "../auth/authContext.js";
import { useNotebook } from "../notebook/useNotebook.js";
import { usePythonKernel } from "../notebook/usePythonKernel.js";
import { fetchLectureFile } from "../../api/services/lectures.js";
import { MAX_MESSAGE_LENGTH } from "../../api/services/chat.js";
import { cellContextLabel, isSameCellContext, withNotebookContext } from "../../services/notebook/cellContext.js";
import { useLectureChat } from "./useLectureChat.js";
import {
  computeLayout,
  NOTEBOOK_DEFAULT,
  NOTEBOOK_MIN,
  PHONE_QUERY,
  RAIL_WIDTH,
  SIDEBAR_WIDTH,
  sidebarFits,
  VIEWER_DEFAULT,
  VIEWER_MIN,
} from "./chatLayout.js";
import "./workspace.css";

// Opened with their original file (fetched from the backend).
const FILE_VIEWERS = new Set(["pdf", "notes"]);

/* Basic mode: the stored file's public URL (needs the bucket to allow this origin). */
async function downloadFromStorage(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The file could not be downloaded (HTTP ${response.status}).`);
  return response.blob();
}

function matches(query) {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches);
}

/* Whether a media query matches, kept up to date. */
function useMediaQuery(query) {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const update = () => setValue(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, [query]);
  return value;
}

/* The element's width, kept up to date (0 until it is laid out, e.g. in tests). */
function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/*
  The chat-first study workspace:
    header on top, then  menu | chat (always centred) | [notebook] | [material viewer]

  - The chat is the centre of the page, at most 760 px wide, and cannot be moved or
    resized. At /workspace it is ChatPage; Exam and Home take its place on their routes.
  - The menu (ChatSidebar) lists the open chat's materials and all chats. Every chat owns
    its materials: switching chats switches them and closes the viewer; a new chat has none.
  - The material viewer is docked at the right edge, beside the chat. It is resized by its
    left edge and always leaves the chat CHAT_MIN wide (see chatLayout.js). A source chip
    under an answer opens it at the cited page, slide or cell.
  - The notebook is hidden until the header's Notebook button is pressed. It floats over
    the chat (left of the viewer), or is pinned beside the chat.
  - At phone width the menu is an overlay and the notebook and viewer open full-screen.
  - The open chat and the material in the viewer are in the URL:
      /workspace?chat=<session id>&lecture=<lecture id>   (also /workspace/exam?…)
    so a link can be copied, reloaded or shared, Back goes to the previous chat or closes
    the viewer, and a reload keeps both. An id the student doesn't have shows a notice and
    is dropped from the URL. Home has neither.
  - Each material in the menu has a ⋯ menu to rename it or delete it from the library
    (EditLectureDialog / DeleteLectureDialog); × only removes it from the chat.

  What the viewer shows:
    PDF       the real file (PdfViewerPanel), at the cited page
    notes     the rendered Markdown (MaterialViewerPanel)
    slides, notebooks, images, cited notes sections   the extracted content (LectureContentPanel)
  A notebook can also be opened in the runnable notebook from the viewer.

  Basic mode: a backend without AI processing (detected by useLectureLibrary) has no
  file/content endpoints. Files are then opened from the lecture's public S3 URL.

  This component owns the state shared between the panels: the chats, the viewer, the
  panel widths, the upload dialog, the notebook with its kernel, and the notebook cells
  added to the next question.
*/
export default function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const userKey = user?.id ?? user?.email ?? "signed-in-user";
  const library = useLectureLibrary();
  const basic = library.features?.ai === false;
  // null while unknown; the chat-first workspace needs the chat API.
  const chatAvailable = library.features ? library.features.chat === true : null;
  const chat = useLectureChat({ enabled: chatAvailable === true });
  const { kernel, kernelState } = usePythonKernel();
  const notebookState = useNotebook(kernel, userKey);

  const phone = useMediaQuery(PHONE_QUERY);
  const rowRef = useRef(null);
  const measuredWidth = useElementWidth(rowRef);
  const rowWidth = measuredWidth || (typeof window !== "undefined" ? window.innerWidth : 1440);

  const [sidebarOpen, setSidebarOpen] = useState(() => !matches(PHONE_QUERY));
  // Where the material in the viewer was opened (its id is in the URL):
  // { lectureId, focus: { sourceType, sourceNumber } | null, cited, seq }
  const [viewer, setViewer] = useState(null);
  const [viewerWidth, setViewerWidth] = useState(VIEWER_DEFAULT);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [notebookPinned, setNotebookPinned] = useState(false);
  const [notebookWidth, setNotebookWidth] = useState(NOTEBOOK_DEFAULT);
  const [resizing, setResizing] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null); // "chat" | "library" while the dialog is open
  const [notice, setNotice] = useState(null);
  const [renaming, setRenaming] = useState(null); // a lecture, in the rename dialog
  const [deleting, setDeleting] = useState(null); // a lecture, in the delete-from-library dialog
  const [openedFile, setOpenedFile] = useState(null); // { key, url, file, error }
  const [cellContext, setCellContext] = useState([]); // notebook cells added to the next question
  const [cellDragActive, setCellDragActive] = useState(false); // a cell is being dragged
  const [cellDragOver, setCellDragOver] = useState(false); // a touch/pen drag is over the chat
  const [draftAnnouncement, setDraftAnnouncement] = useState({ text: "", seq: 0 });
  const [tooLong, setTooLong] = useState(null);

  const isChatRoute = location.pathname === "/workspace";

  /* ---------- URL: ?chat=<session id>&lecture=<lecture id> ---------- */
  const [searchParams] = useSearchParams();
  const isHome = location.pathname === "/workspace/home";
  const urlChatId = isHome ? null : searchParams.get("chat");
  const urlLectureId = isHome ? null : searchParams.get("lecture");
  // Home has no chat or viewer: opening one from there goes to the chat.
  const pagePath = isHome ? "/workspace" : location.pathname;
  const currentChatId = isHome ? chat.activeId : urlChatId;
  const hrefFor = (path, { chatId = currentChatId, lectureId = null } = {}) => {
    const params = new URLSearchParams();
    if (chatId) params.set("chat", chatId);
    if (lectureId) params.set("lecture", lectureId);
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };

  /* ---------- Materials ---------- */
  const session = chat.activeSession;
  const libraryById = useMemo(() => new Map(library.lectures.map((item) => [item.id, item])), [library.lectures]);
  // The library is polled while files process, so it has the freshest copy of a lecture.
  const chatLectures = (session?.lectures ?? []).map((item) => libraryById.get(item.id) ?? item);
  const chatMaterials = chatLectures.map(toMaterial);
  const chatIds = new Set(chatLectures.map((item) => item.id));
  const addable = library.lectures.filter((item) => !chatIds.has(item.id)).map(toMaterial);
  const findLecture = (id) => libraryById.get(id) ?? chatLectures.find((item) => item.id === id) ?? null;
  const materialType = (id) => {
    const lecture = findLecture(id);
    return lecture ? toMaterial(lecture).type : undefined;
  };

  const viewerLecture = urlLectureId ? findLecture(urlLectureId) : null;
  const viewerMaterial = viewerLecture ? toMaterial(viewerLecture) : null;
  const viewerOpen = viewerMaterial !== null;
  // A lecture opened from a link or with Back has no cited place.
  const opened = viewer?.lectureId === urlLectureId ? viewer : { focus: null, cited: false, seq: 0 };

  /* ---------- Widths ---------- */
  const sidebarMode = phone ? "phone" : sidebarFits(rowWidth, viewerOpen) ? "docked" : "overlay";
  const sideWidth = phone ? 0 : sidebarMode === "docked" && sidebarOpen ? SIDEBAR_WIDTH : RAIL_WIDTH;
  const layout = computeLayout({
    width: rowWidth,
    sidebar: sideWidth,
    viewer: { open: viewerOpen, width: viewerWidth },
    notebook: { open: notebookOpen, pinned: notebookPinned, width: notebookWidth },
  });
  // The row's right edge on screen (the panels grow leftwards from it); 0 when not laid out.
  const rowRight = () => rowRef.current?.getBoundingClientRect().right || rowWidth;
  const clampViewer = (width) => Math.round(Math.min(layout.viewerMax, Math.max(VIEWER_MIN, width)));
  const clampNotebook = (width) => Math.round(Math.min(layout.notebookMax, Math.max(NOTEBOOK_MIN, width)));

  /* ---------- Viewer ---------- */
  function openViewer(lectureId, focus = null, cited = false) {
    setViewer((previous) => ({ lectureId, focus, cited, seq: (previous?.seq ?? 0) + 1 }));
    // Make room: the full menu does not fit beside the chat and the viewer on small screens.
    if (phone || !sidebarFits(rowWidth, true)) setSidebarOpen(false);
    // Another place in the same lecture doesn't add a history entry.
    navigate(hrefFor(pagePath, { lectureId }), { replace: !isHome && urlLectureId === lectureId });
  }

  function closeViewer({ replace = false } = {}) {
    setViewer(null);
    navigate(hrefFor(pagePath), { replace });
  }

  const showsSource = viewerMaterial !== null && (opened.focus?.sourceType ?? "page") !== "page";
  const needsFile = viewerMaterial !== null && FILE_VIEWERS.has(viewerMaterial.type) && !showsSource && !basic;
  const fileKey = needsFile ? `${viewerMaterial.id}:${viewerMaterial.lecture.content_version}` : null;

  // Fetch the open PDF or notes file (the file endpoint needs the auth header, so an
  // <iframe src> or a plain link can't load it directly).
  useEffect(() => {
    if (!fileKey) return undefined;
    const lecture = viewerLecture;
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
    // The lecture object changes on every poll; the key captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  /* ---------- Chats ---------- */
  // The URL leads: a link, a reload or Back opens the chat in ?chat= (none: a new chat).
  // `appliedChat` is the ?chat= value last applied, so a chat created by its first question
  // or material is written to the URL instead of being taken for a change of the URL.
  const appliedChat = useRef(undefined);
  useEffect(() => {
    if (isHome || chatAvailable !== true || appliedChat.current === urlChatId) return;
    if (urlChatId && chat.sessionsLoading) return; // checked once the chats are loaded
    appliedChat.current = urlChatId;
    if (urlChatId === chat.activeId) return;
    setTooLong(null);
    if (!urlChatId) {
      chat.startNewChat();
    } else if (chat.sessionsError || chat.sessions.some((item) => item.id === urlChatId)) {
      chat.openSession(urlChatId);
    } else {
      setNotice("That chat isn’t in your chats.");
      navigate(hrefFor(pagePath, { chatId: null, lectureId: urlLectureId }), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHome, chatAvailable, urlChatId, chat.sessionsLoading]);

  // The open chat changed without the URL (created by its first question or material, or
  // deleted): put it in the URL.
  useEffect(() => {
    if (isHome || chatAvailable !== true || appliedChat.current !== urlChatId || chat.activeId === urlChatId) return;
    appliedChat.current = chat.activeId;
    navigate(hrefFor(pagePath, { chatId: chat.activeId, lectureId: urlLectureId }), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.activeId]);

  // A link to a lecture that isn't (or no longer is) in the student's materials. A lecture
  // just deleted here leaves the URL without that notice.
  const deletedLecture = useRef(null);
  useEffect(() => {
    if (!urlLectureId || library.loading || library.error || viewerLecture) return;
    if (chatAvailable === null || (chatAvailable && appliedChat.current !== urlChatId)) return; // the chat in the URL first (effects above)
    if (urlLectureId !== deletedLecture.current) setNotice("That lecture isn’t in your materials.");
    navigate(hrefFor(pagePath), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLectureId, urlChatId, chat.activeId, library.loading, library.error, viewerLecture, chatAvailable]);

  function closeOverlayMenu() {
    if (sidebarMode !== "docked") setSidebarOpen(false);
  }

  // Another chat has other materials, so the viewer closes.
  function openChat(id) {
    setTooLong(null);
    closeOverlayMenu();
    const path = isChatRoute ? location.pathname : "/workspace";
    if (id !== currentChatId || !isChatRoute) navigate(hrefFor(path, { chatId: id }));
  }

  // A chat's ⋯ → Remove in the menu. Removing the open chat leaves an empty new chat, with
  // no chat or material in the URL; removing another chat leaves the open one as it is.
  async function removeChat(session) {
    const wasOpen = session.id === chat.activeId;
    try {
      await chat.remove(session.id);
    } catch (err) {
      setNotice(err.message || "The chat could not be removed.");
      return false;
    }
    if (wasOpen) {
      setViewer(null);
      // Mark the URL change as ours, so the "open chat changed" effect doesn't write the
      // material back into the URL.
      appliedChat.current = null;
      if (!isHome) navigate(hrefFor(pagePath, { chatId: null }), { replace: true });
    }
    setNotice("Chat removed.");
    return true;
  }

  function newChat() {
    setTooLong(null);
    closeOverlayMenu();
    if (isChatRoute && !currentChatId) {
      chat.startNewChat(); // already on a new chat: just clear it
      if (urlLectureId) closeViewer();
      return;
    }
    navigate("/workspace");
  }

  async function handleUpload(files) {
    const target = uploadTarget;
    // The chat the files were uploaded for, even if the student switches chats meanwhile.
    const sessionId = session?.id ?? null;
    setUploadTarget(null);
    const created = await library.upload(files, target === "chat" ? { chatId: sessionId } : {});
    if (created.length === 0) return;
    if (target !== "chat") {
      setNotice(`${created.length === 1 ? "1 file" : `${created.length} files`} uploaded.`);
      return;
    }
    try {
      await chat.attachLectures(sessionId, created.map((item) => item.id));
      setNotice(`${created.length === 1 ? "1 material" : `${created.length} materials`} added to this chat.`);
    } catch (err) {
      setNotice(err.message || "The upload could not be added to this chat.");
    }
  }

  async function addToChat(material) {
    try {
      await chat.attachLectures(session?.id ?? null, [material.id]);
      setNotice(`${material.name} added to this chat.`);
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function removeFromChat(material) {
    if (!session) return;
    try {
      await chat.detachLecture(session.id, material.id);
      if (urlLectureId === material.id) closeViewer({ replace: true });
      setNotice(`${material.name} removed from this chat.`);
    } catch (err) {
      setNotice(err.message);
    }
  }

  function openMaterial(material) {
    closeOverlayMenu();
    openViewer(material.id);
  }

  function openSource(chip) {
    if (!findLecture(chip.lectureId)) {
      setNotice("That lecture is no longer in your materials.");
      return;
    }
    openViewer(chip.lectureId, { sourceType: chip.sourceType, sourceNumber: chip.number }, true);
  }

  async function openInNotebook(material) {
    try {
      const blob = basic ? await downloadFromStorage(material.lecture.s3_url) : await fetchLectureFile(material.id);
      setNotebookOpen(true);
      await notebookState.actions.openFile(new File([blob], material.lecture.original_filename, { type: "application/x-ipynb+json" }));
    } catch (err) {
      setNotice(
        basic
          ? "This notebook can’t be loaded here (the file storage blocks this site). You can download it instead."
          : err.message || "The notebook could not be opened."
      );
    }
  }

  async function handleRetry(material) {
    try {
      await library.retry(material.id);
    } catch (err) {
      setNotice(err.message);
    }
  }

  /* ---------- Library: rename, delete ---------- */
  async function handleRename(title) {
    const updated = await library.rename(renaming.id, title);
    chat.updateLecture(updated);
    setRenaming(null);
    setNotice("Lecture renamed.");
  }

  // Deleted for good: from the library and from every chat that had it.
  async function handleDeleteLecture() {
    const { id } = deleting;
    deletedLecture.current = id;
    await library.remove(id);
    chat.forgetLecture(id);
    if (urlLectureId === id) closeViewer({ replace: true });
    setDeleting(null);
    setNotice("Lecture deleted.");
  }

  /* ---------- Notebook cells as context ---------- */
  // Screen-reader feedback for the draft; `seq` makes a repeated message announce again.
  const announce = useCallback((text) => setDraftAnnouncement((previous) => ({ text, seq: previous.seq + 1 })), []);

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

  // Returns false (the composer then keeps the text) when the question can't be sent as is.
  function handleSend(text) {
    const cells = cellContext;
    const content = withNotebookContext(text, cells);
    if (content.length > MAX_MESSAGE_LENGTH) {
      setTooLong(
        `Your question with the added notebook cells is ${content.length} characters; the limit is ${MAX_MESSAGE_LENGTH}. Remove a cell or shorten the question.`
      );
      return false;
    }
    setTooLong(null);
    const extras = cells.map((cell) => `Notebook context: ${cellContextLabel(cell)}`);
    chat.send({ question: text, content, extras }).then((ok) => {
      // Clear the sent cells only once answered; on failure they stay in the draft.
      if (ok) setCellContext((list) => list.filter((item) => !cells.some((cell) => cell.id === item.id)));
    });
    return true;
  }

  /* ---------- Keyboard ---------- */
  // Escape closes the overlay menu (not while a dialog is open — Escape is theirs then).
  useEffect(() => {
    if (!sidebarOpen || sidebarMode === "docked") return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, sidebarMode]);

  /* ---------- Outlet context ---------- */
  const chatView = {
    available: chatAvailable,
    session,
    messages: chat.messages,
    loading: chat.messagesLoading,
    busy: chat.busy,
    materials: chatMaterials,
    materialType,
    lectureTitle: (id) => findLecture(id)?.title,
    onOpenSource: openSource,
    onUploadClick: () => setUploadTarget("chat"),
    // The scope chip: show the chat's materials (opening the menu if needed).
    onOpenMenu: () => {
      setSidebarOpen(true);
      requestAnimationFrame(() => document.getElementById("cf-materials")?.focus());
    },
    onRename: (title) => chat.rename(session.id, title),
    // A deleted chat leaves an empty new chat (its materials are kept in the library).
    onDelete: async () => {
      await chat.remove(session.id);
      setViewer(null);
      navigate("/workspace", { replace: true });
    },
    onSend: handleSend,
    note: chatAvailable === false ? "This server has no chat assistant yet." : tooLong,
    cellContext,
    cellDragActive,
    cellDragOver,
    onAddCell: addCellToDraft,
    onRemoveCell: removeCellFromDraft,
    announcement: draftAnnouncement,
  };

  const home = {
    materials: library.lectures.map(toMaterial),
    uploads: library.uploads,
    loading: library.loading,
    onUploadClick: () => setUploadTarget("library"),
    onDismissUpload: library.dismissUpload,
    onOpenMaterial: (material) => openViewer(material.id),
  };

  /* ---------- Viewer content ---------- */
  const fileState = openedFile?.key === fileKey ? openedFile : null;
  let viewerContent = null;
  if (viewerMaterial) {
    const citedPage = opened.focus?.sourceType === "page" ? opened.focus.sourceNumber : 1;
    // A cited page can be out of range after the file was replaced with a shorter one.
    const pdfPage = Math.max(1, Math.min(citedPage, viewerMaterial.pages || citedPage));
    if (viewerMaterial.type === "pdf" && !showsSource) {
      viewerContent = (
        // `key` resets page and zoom when another PDF, version or source is opened.
        <PdfViewerPanel
          key={`${fileKey ?? viewerMaterial.id}:${opened.seq}`}
          material={
            basic
              ? { ...viewerMaterial, url: viewerMaterial.lecture.s3_url, loading: false, loadError: null }
              : { ...viewerMaterial, url: fileState?.url ?? null, loading: !fileState, loadError: fileState?.error ?? null }
          }
          initialPage={pdfPage}
          cited={opened.cited && opened.focus?.sourceType === "page"}
          onCollapse={() => closeViewer()}
        />
      );
    } else if (viewerMaterial.type === "notes" && !showsSource && fileState?.file) {
      viewerContent = (
        <MaterialViewerPanel
          key={fileKey}
          material={{ ...viewerMaterial, name: viewerMaterial.lecture.original_filename, file: fileState.file, url: fileState.url }}
          onCollapse={() => closeViewer()}
        />
      );
    } else {
      viewerContent = (
        <LectureContentPanel
          key={`${viewerMaterial.id}:${opened.seq}`}
          lecture={viewerMaterial.lecture}
          focus={opened.focus}
          cited={opened.cited}
          onRetry={() => handleRetry(viewerMaterial)}
          onClose={() => closeViewer()}
          onOpenInNotebook={viewerMaterial.type === "notebook" ? () => openInNotebook(viewerMaterial) : null}
        />
      );
    }
  }

  const notebookActions = (
    <>
      <IconButton
        icon="dock"
        className={`cf-panel-toggle ${layout.pinned ? "cf-panel-toggle--on" : ""}`}
        label={layout.pinned ? "Float over the chat" : "Pin beside the chat"}
        aria-pressed={layout.pinned}
        disabled={!layout.canPin && !layout.pinned}
        title={!layout.canPin ? "Not enough room to pin the notebook beside the chat" : undefined}
        onClick={() => {
          const next = !notebookPinned;
          setNotebookPinned(next);
          // Keep the width valid for the new mode.
          const nextLayout = computeLayout({
            width: rowWidth,
            sidebar: sideWidth,
            viewer: { open: viewerOpen, width: viewerWidth },
            notebook: { open: true, pinned: next, width: notebookWidth },
          });
          setNotebookWidth(nextLayout.notebookWidth);
        }}
      />
      <IconButton
        icon={layout.wide ? "collapse" : "expand"}
        className="cf-panel-toggle cf-panel-wide"
        label={layout.wide ? "Restore notebook width" : "Widen notebook"}
        disabled={!layout.canWiden}
        onClick={() => setNotebookWidth(layout.toggledWidth)}
      />
      <IconButton icon="close" label="Close notebook" onClick={() => setNotebookOpen(false)} />
    </>
  );

  return (
    <div className={`workspace ${resizing ? "workspace--resizing" : ""}`}>
      <WorkspaceHeader
        menuOpen={sidebarOpen}
        onToggleMenu={phone ? () => setSidebarOpen((value) => !value) : null}
        notebookOpen={notebookOpen}
        onToggleNotebook={() => setNotebookOpen((value) => !value)}
      />

      {notice && (
        <TransientStatus key={notice} duration={4000} onDismiss={() => setNotice(null)}>
          <p className="workspace__notice" role="status">
            {notice}
          </p>
        </TransientStatus>
      )}

      <div ref={rowRef} className={`cf ${phone ? "cf--phone" : ""}`}>
        <ChatSidebar
          open={sidebarOpen}
          mode={sidebarMode}
          onToggle={() => setSidebarOpen((value) => !value)}
          onNewChat={newChat}
          chatTitle={session?.title ?? "New chat"}
          materials={chatMaterials}
          // Only the files being uploaded into this chat (not those from Home or for another chat).
          uploads={library.uploads.filter((item) => item.chatId !== undefined && item.chatId === (session?.id ?? null))}
          addable={chatAvailable ? addable : []}
          viewerLectureId={viewerOpen ? urlLectureId : null}
          onOpenMaterial={openMaterial}
          onRemoveMaterial={removeFromChat}
          onUploadClick={() => {
            closeOverlayMenu();
            setUploadTarget("chat");
          }}
          onAddMaterial={addToChat}
          onRetryMaterial={handleRetry}
          onRenameMaterial={(material) => setRenaming(material.lecture)}
          onDeleteMaterial={(material) => setDeleting(material.lecture)}
          onDismissUpload={library.dismissUpload}
          sessions={chat.sessions}
          activeId={chat.activeId}
          sessionsLoading={chatAvailable === null || chat.sessionsLoading}
          sessionsError={chat.sessionsError}
          onOpenChat={openChat}
          onReloadChats={() => chat.reloadSessions()}
          onRemoveChat={removeChat}
          available={chatAvailable !== false}
        />

        <main className="cf__main">
          <Outlet context={{ chatView, home }} />
        </main>

        {notebookOpen && (
          <aside
            className={`cf-notebook ${layout.pinned ? "cf-notebook--pinned" : "cf-notebook--floating"}`}
            aria-label="Notebook panel"
            style={{ width: layout.notebookWidth, right: layout.pinned ? undefined : layout.viewerWidth }}
          >
            <ResizeHandle
              label="Resize notebook (drag, or use the left and right arrow keys)"
              onResize={(x) => setNotebookWidth(clampNotebook(rowRight() - layout.viewerWidth - x))}
              onStep={(step) => setNotebookWidth(clampNotebook(layout.notebookWidth + step))}
              onReset={() => setNotebookWidth(NOTEBOOK_DEFAULT)}
              onResizing={setResizing}
            />
            <NotebookPage
              notebookState={notebookState}
              kernel={kernel}
              kernelState={kernelState}
              assistantDraft={assistantDraft}
              panelActions={notebookActions}
            />
          </aside>
        )}

        {viewerOpen && (
          <aside className="cf-viewer" aria-label={`${viewerMaterial.name}, open beside the chat`} style={{ width: layout.viewerWidth }}>
            <ResizeHandle
              label="Resize the material viewer (drag, or use the left and right arrow keys)"
              onResize={(x) => setViewerWidth(clampViewer(rowRight() - x))}
              onStep={(step) => setViewerWidth(clampViewer(layout.viewerWidth + step))}
              onReset={() => setViewerWidth(VIEWER_DEFAULT)}
              onResizing={setResizing}
            />
            {viewerContent}
          </aside>
        )}
      </div>

      {renaming && <EditLectureDialog lecture={renaming} onSave={handleRename} onCancel={() => setRenaming(null)} />}
      {deleting && <DeleteLectureDialog lecture={deleting} onConfirm={handleDeleteLecture} onCancel={() => setDeleting(null)} />}

      {uploadTarget && (
        <UploadDialog
          basic={basic}
          note={uploadTarget === "chat" ? "Files are saved to your account and added to this chat. The answers in this chat then come from them." : undefined}
          onCancel={() => setUploadTarget(null)}
          onUpload={handleUpload}
        />
      )}
    </div>
  );
}
