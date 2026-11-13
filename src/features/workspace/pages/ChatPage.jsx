import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import Menu from "../../../components/ui/Menu.jsx";
import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";
import ChatComposer from "../components/ChatComposer.jsx";
import { renderMarkdown } from "../../../services/notebook/markdown.js";
import {
  CELL_DROP_ZONE_ATTR,
  isCellDrag,
  lineCount,
  displayChatTitle,
  parseNotebookContext,
  readCellDrag,
} from "../../../services/notebook/cellContext.js";
import { sourceChips } from "../chatLayout.js";

// The backend's fixed answer when a chat's lectures have no extracted text saved.
export const NO_TEXT_ANSWER = "The selected lectures have no readable text yet";

/*
  The chat (/workspace): always centred, at most 760 px wide, with the composer the same
  width under it. The state lives in WorkspaceLayout (passed in as `chatView` through the
  Outlet context), so it survives switching to the Exam view and back.

  - A new or empty chat shows "What are we studying today?" with Upload materials.
  - Answers that cite the chat's materials list them as chips ("p. 12 · KI 02 …",
    "Slide 3 · …", "Cell 16 · …"); a chip opens that place in the viewer.
  - Answers without sources come from general knowledge and say "Not from your materials".
  - Notebook cells can be dropped anywhere on the chat; they are sent with the next question.
*/
export default function ChatPage() {
  const { chatView } = useOutletContext();
  return <ChatView {...chatView} />;
}

export function ChatView({
  available,
  session,
  messages,
  loading,
  busy,
  materials,
  materialType,
  lectureTitle,
  onOpenSource,
  onUploadClick,
  onOpenMenu,
  onRename,
  onDelete,
  onSend,
  note,
  cellContext,
  cellDragActive,
  cellDragOver,
  onAddCell,
  onRemoveCell,
  announcement,
  olderMessages = false,
  loadingOlder = false,
  onLoadOlder = () => {},
}) {
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const [renaming, setRenaming] = useState(null); // the title being typed
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const scrollRef = useRef(null);
  const slow = useSlow(busy, 15000);
  const dropOver = nativeDragOver || cellDragOver;
  const title = displayChatTitle(session?.title) ?? "New chat";
  const count = materials.length;
  const empty = !loading && messages.length === 0;

  /*
    Keep the newest message in view — except when older messages were just added above
    (scrolling up loads them page by page): then the view stays on what the student was
    reading.
  */
  const shown = useRef({ first: null, last: null, height: 0 });
  useLayoutEffect(() => {
    const body = scrollRef.current;
    if (!body) return;
    const first = messages[0]?.id ?? null;
    const last = messages.at(-1)?.id ?? null;
    const previous = shown.current;
    if (previous.last !== null && last === previous.last && first !== previous.first) {
      body.scrollTop += body.scrollHeight - previous.height;
    } else {
      body.scrollTop = body.scrollHeight;
    }
    shown.current = { first, last, height: body.scrollHeight };
  }, [messages, busy]);

  // Near the top: load the messages before those shown.
  function handleScroll(event) {
    shown.current.height = event.currentTarget.scrollHeight;
    if (olderMessages && !loadingOlder && event.currentTarget.scrollTop < 160) onLoadOlder();
  }

  function handleDragOver(event) {
    if (!isCellDrag(event.dataTransfer)) return;
    event.preventDefault(); // allows the drop
    event.dataTransfer.dropEffect = "copy";
    setNativeDragOver(true);
  }

  function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setNativeDragOver(false);
  }

  function handleDrop(event) {
    if (!isCellDrag(event.dataTransfer)) return;
    event.preventDefault();
    setNativeDragOver(false);
    const item = readCellDrag(event.dataTransfer);
    if (item) onAddCell(item);
  }

  async function submitRename(event) {
    event.preventDefault();
    const value = renaming.trim();
    if (!value) return;
    try {
      await onRename(value);
      setRenaming(null);
      setActionError(null);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function confirmDelete() {
    setDeleting(false);
    try {
      await onDelete();
      setActionError(null);
    } catch (err) {
      setActionError(err.message);
    }
  }

  const scopeLabel = count === 0 ? "No materials yet" : count === 1 ? materials[0].name : `${count} materials`;
  const status =
    count === 0 ? "No materials in this chat yet." : count === 1 ? "1 material ready in this chat." : `${count} materials ready in this chat.`;

  return (
    <section
      className={`chat ${dropOver ? "chat--drop-over" : ""}`}
      aria-labelledby="chat-title"
      {...{ [CELL_DROP_ZONE_ATTR]: "" }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="chat__bar">
        {renaming !== null ? (
          <form className="chat__rename" onSubmit={submitRename}>
            <label className="visually-hidden" htmlFor="chat-rename">
              Chat title
            </label>
            <input
              id="chat-rename"
              value={renaming}
              maxLength={255}
              autoFocus
              onChange={(event) => setRenaming(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setRenaming(null)}
            />
            <IconButton icon="check" label="Save title" type="submit" disabled={!renaming.trim()} />
            <IconButton icon="close" label="Cancel renaming" onClick={() => setRenaming(null)} />
          </form>
        ) : (
          <h1 id="chat-title" className="chat__title" title={title}>
            {title}
          </h1>
        )}
        {session && renaming === null && (
          <Menu
            label="Chat actions"
            items={[
              { label: "Rename chat", icon: "edit", onSelect: () => setRenaming(title) },
              { label: "Delete chat", icon: "trash", danger: true, onSelect: () => setDeleting(true) },
            ]}
          />
        )}
      </div>
      {actionError && (
        <p className="chat__error" role="alert">
          {actionError}
        </p>
      )}

      <div className="chat__scroll" ref={scrollRef} onScroll={handleScroll}>
        {loading ? (
          <p className="chat__loading" role="status">
            Loading the chat…
          </p>
        ) : empty ? (
          <div className="chat__empty">
            <h2 className="chat__empty-title">What are we studying today?</h2>
            <p className="chat__empty-text">
              {available === false
                ? "This server has no chat assistant yet, so questions can’t be answered here."
                : "Each chat has its own materials. Upload the lectures for this chat and the answers will come from them, with the pages they are based on."}
            </p>
            <button type="button" className="btn btn--primary chat__empty-upload" onClick={onUploadClick} disabled={available === false}>
              <Icon name="upload" />
              Upload materials
            </button>
            <span className="chat__empty-status">{status}</span>
          </div>
        ) : (
          <ol className="chat__thread" aria-label="Messages" aria-live="polite">
            {olderMessages && (
              <li className="chat__older">
                <button type="button" className="cf-link-button" onClick={onLoadOlder} disabled={loadingOlder}>
                  {loadingOlder ? "Loading earlier messages…" : "Show earlier messages"}
                </button>
              </li>
            )}
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                materialType={materialType}
                lectureTitle={lectureTitle}
                onOpenSource={onOpenSource}
                onUploadAgain={onUploadClick}
              />
            ))}
            {busy && (
              <li className="chat-msg chat-msg--system" role="status">
                {slow ? "Still working — the AI can take a minute or two when it’s busy…" : "Reading your materials…"}
              </li>
            )}
          </ol>
        )}
      </div>

      <div className="chat__dock">
        <ChatComposer
          cellContext={cellContext}
          cellDragActive={cellDragActive}
          dropOver={dropOver}
          note={note}
          onSend={onSend}
          onAttachClick={onUploadClick}
          attachDisabled={available === false}
          onRemoveCell={onRemoveCell}
          disabled={busy || available !== true}
          scope={{ label: scopeLabel, onClick: onOpenMenu }}
        />
        <p className="chat__disclaimer">Answers cite this chat’s materials. General answers are marked “Not from your materials”.</p>
      </div>

      <p className="visually-hidden" role="status">
        <span key={announcement.seq}>{announcement.text}</span>
      </p>

      {deleting && (
        <ConfirmDialog title="Delete chat?" confirmLabel="Delete" danger onConfirm={confirmDelete} onCancel={() => setDeleting(false)}>
          “{title}” and all its messages will be deleted. Its materials are kept.
        </ConfirmDialog>
      )}
    </section>
  );
}

function ChatMessage({ message, materialType, lectureTitle, onOpenSource, onUploadAgain }) {
  if (message.role === "system") {
    return (
      <li className="chat-msg chat-msg--system" role="alert">
        {message.content}
      </li>
    );
  }
  if (message.role === "user") {
    // Notebook cells added to the question are shown as code cards, not as the raw text block.
    const { text, cells } = parseNotebookContext(message.content);
    return (
      <li className={`chat-msg chat-msg--student ${message.pending ? "chat-msg--pending" : ""}`}>
        <span className="chat-msg__text">{text}</span>
        {cells.length > 0 && (
          <ul className="chat-cells" aria-label="Notebook cells added to this question">
            {cells.map((cell, index) => (
              <ChatCell key={`${cell.label}-${index}`} cell={cell} />
            ))}
          </ul>
        )}
        {message.extras?.map((extra) => (
          <span key={extra} className="chat-msg__files">
            {extra}
          </span>
        ))}
      </li>
    );
  }
  if (message.content.startsWith(NO_TEXT_ANSWER)) {
    return (
      <li className="chat-msg chat-msg--assistant chat-msg--no-text" role="note">
        <p className="chat-msg__no-text-title">
          <Icon name="alert" size={14} />
          This chat’s materials have no readable text saved
        </p>
        <p>The assistant can only answer from text read from the files when they were uploaded. Scanned PDFs (pages that are images) have no text to read.</p>
        <button type="button" className="cf-link-button" onClick={onUploadAgain}>
          Upload the file again
        </button>
      </li>
    );
  }
  const chips = sourceChips(message.sources, materialType, lectureTitle);
  return (
    <li className="chat-msg chat-msg--assistant">
      <article className="chat-answer">
        {chips.length === 0 && (
          <span className="chat-answer__general">
            <Icon name="alert" size={14} />
            Not from your materials
          </span>
        )}
        <div className="chat-msg__md markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
        {chips.length > 0 && (
          <ul className="chat-sources" aria-label="Sources">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  className="chat-source"
                  title="Open this page beside the chat"
                  onClick={() => onOpenSource(chip)}
                >
                  <span className="chat-source__loc">{chip.loc}</span>
                  <span className="chat-source__doc">{chip.doc}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </li>
  );
}

/* True once `active` has lasted `afterMs` (resets when it ends). */
function useSlow(active, afterMs) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setSlow(true), afterMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, afterMs]);
  return slow;
}

// Cells longer than this start folded, so a long cell doesn't push the answer out of view.
const OPEN_CELL_LINES = 12;

/* A notebook cell added to a question: its label and full source, foldable. */
function ChatCell({ cell }) {
  const lines = lineCount(cell.source);
  return (
    <li className={`chat-cell chat-cell--${cell.cellType}`}>
      <details open={lines <= OPEN_CELL_LINES}>
        <summary className="chat-cell__head">
          <Icon name={cell.cellType === "code" ? "code" : "text"} size={14} />
          <span className="chat-cell__label">{cell.label}</span>
          {cell.notebookTitle && <span className="chat-cell__meta">· {cell.notebookTitle}</span>}
          <span className="chat-cell__meta chat-cell__lines">
            {lines} {lines === 1 ? "line" : "lines"}
          </span>
        </summary>
        <pre className="chat-cell__code">
          <code>{cell.source}</code>
        </pre>
      </details>
    </li>
  );
}
