import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import Menu from "../../../components/ui/Menu.jsx";
import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import ChatComposer from "../components/ChatComposer.jsx";
import { renderAnswerMarkdown, renderMarkdown } from "../../../services/notebook/markdown.js";
import { LABELS as EXAM_LABELS, parseExamQuestionMessage } from "../../exam/askAboutAnswer.js";
import {
  CELL_DROP_ZONE_ATTR,
  isCellDrag,
  lineCount,
  displayChatTitle,
  parseNotebookContext,
  readCellDrag,
} from "../../../services/notebook/cellContext.js";
import { sourceChips } from "../chatLayout.js";
import { copyText } from "../../../services/clipboard.js";

// The backend's fixed answer when a chat's lectures have no extracted text saved.
export const NO_TEXT_ANSWER = "The selected lectures have no readable text yet";

/*
  The chat (/workspace): always centred, at most 760 px wide, with the composer the same
  width under it. The state lives in WorkspaceLayout (passed in as `chatView` through the
  Outlet context), so it survives switching to the Exam view and back.

  - A new or empty chat shows "What are we studying today?"; materials are added from the menu.
  - Answers that cite the chat's materials list them as chips ("p. 12 · KI 02 …",
    "Slide 3 · …", "Cell 16 · …"); a chip opens that place in the viewer.
  - Answers without sources come from general knowledge and say "Not from your materials".
  - Notebook cells can be dropped anywhere on the chat; they are sent with the next question.
  - A question asked from the exam results ("Ask about this") shows as its heading line with
    the question, choices, answer and feedback quoted under it; while the chat is opened
    from there (?exam= in the URL) the bar has "Back to exam results".
  - Every code block in an answer has a Copy button (just that code), and every answer has a
    Copy button under it (the whole answer as Markdown, with its sources). When the
    clipboard can't be used, a dialog shows the text selected for copying by hand.
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
  examLink = null,
}) {
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const [renaming, setRenaming] = useState(null); // the title being typed
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [copyFallback, setCopyFallback] = useState(null); // text to copy by hand
  const [copyNote, setCopyNote] = useState({ text: "", seq: 0 }); // for screen readers
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

  // Copies text; on failure shows it in a dialog for copying by hand. Resolves to success.
  async function copy(text, what) {
    const copied = await copyText(text);
    if (copied) setCopyNote((note) => ({ text: `${what} copied.`, seq: note.seq + 1 }));
    else setCopyFallback(text);
    return copied;
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

  const scopeLabel = count === 1 ? materials[0].name : `${count} materials`;
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
        {examLink && renaming === null && (
          <Link to={examLink} className="btn btn--secondary btn--sm chat__exam-link" aria-label="Back to exam results">
            <Icon name="arrowLeft" size={14} />
            <span className="chat__exam-link-long">Back to exam results</span>
            <span className="chat__exam-link-short" aria-hidden="true">
              Exam results
            </span>
          </Link>
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
                onCopy={copy}
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
          scope={count > 0 ? { label: scopeLabel, onClick: onOpenMenu } : null}
        />
        <p className="chat__disclaimer">Answers cite this chat’s materials. General answers are marked “Not from your materials”.</p>
      </div>

      <p className="visually-hidden" role="status">
        <span key={announcement.seq}>{announcement.text}</span>
      </p>
      <p className="visually-hidden" role="status">
        <span key={copyNote.seq}>{copyNote.text}</span>
      </p>

      {copyFallback !== null && <CopyFallbackDialog text={copyFallback} onClose={() => setCopyFallback(null)} />}

      {deleting && (
        <ConfirmDialog title="Delete chat?" confirmLabel="Delete" danger onConfirm={confirmDelete} onCancel={() => setDeleting(false)}>
          “{title}” and all its messages will be deleted. Its materials are kept.
        </ConfirmDialog>
      )}
    </section>
  );
}

function ChatMessage({ message, materialType, lectureTitle, onOpenSource, onUploadAgain, onCopy }) {
  if (message.role === "system") {
    return (
      <li className="chat-msg chat-msg--system" role="alert">
        {message.content}
      </li>
    );
  }
  if (message.role === "user") {
    const exam = parseExamQuestionMessage(message.content);
    if (exam) return <ExamQuestionMessage message={message} exam={exam} />;
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

  // A code block's Copy button (in the answer's HTML): copies only that block's code.
  async function handleAnswerClick(event) {
    const button = event.target.closest?.("[data-copy-code]");
    if (!button) return;
    // Without the line break Markdown adds after the last line.
    const code = (button.parentElement.querySelector("pre")?.textContent ?? "").replace(/\n$/, "");
    const copied = await onCopy(code, "Code");
    if (!copied) return;
    button.textContent = "Copied";
    button.dataset.copied = "";
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => {
      button.textContent = "Copy";
      delete button.dataset.copied;
    }, COPIED_MS);
  }

  return (
    <li className="chat-msg chat-msg--assistant">
      <article className="chat-answer">
        {chips.length === 0 && (
          <span className="chat-answer__general">
            <Icon name="alert" size={14} />
            Not from your materials
          </span>
        )}
        {/* The click handler only serves the code blocks' Copy buttons (native buttons, so keyboard works). */}
        <div
          className="chat-msg__md markdown-body"
          onClick={handleAnswerClick}
          dangerouslySetInnerHTML={{ __html: withCodeCopyButtons(renderAnswerMarkdown(message.content)) }}
        />
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
        <div className="chat-answer__actions">
          <CopyAnswerButton text={answerText(message.content, chips)} onCopy={onCopy} />
        </div>
      </article>
    </li>
  );
}

/*
  A question asked from the exam results: the heading line, then each part under its label,
  quoted. The exam's texts (question, choices, feedback) are Markdown, as in the results;
  the student's own answer is plain text.
*/
function ExamQuestionMessage({ message, exam }) {
  return (
    <li className={`chat-msg chat-msg--student chat-msg--exam ${message.pending ? "chat-msg--pending" : ""}`}>
      <span className="chat-exam__from">
        <Icon name="graduation" size={14} />
        From your exam results
      </span>
      <span className="chat-msg__text chat-exam__heading">{exam.heading}</span>
      <dl className="chat-exam">
        {exam.parts.map((part, index) => (
          <div key={`${part.label}-${index}`} className={part.quote === undefined ? "chat-exam__row" : "chat-exam__part"}>
            <dt className="chat-exam__label">{part.label}</dt>
            {part.quote === undefined ? (
              <dd className="chat-exam__value">{part.value}</dd>
            ) : part.label === EXAM_LABELS.answer ? (
              <dd className="chat-exam__quote chat-msg__text">{part.quote}</dd>
            ) : part.label === EXAM_LABELS.choices ? (
              <dd className="chat-exam__quote">
                <ul className="chat-exam__choices">
                  {choiceItems(part.quote).map((choice) => (
                    <li key={choice.letter}>
                      <span className="chat-exam__letter">{choice.letter}</span>
                      <span className="chat-exam__md" dangerouslySetInnerHTML={{ __html: renderMarkdown(choice.text) }} />
                    </li>
                  ))}
                </ul>
              </dd>
            ) : (
              <dd className="chat-exam__quote chat-exam__md" dangerouslySetInnerHTML={{ __html: renderMarkdown(part.quote) }} />
            )}
          </div>
        ))}
      </dl>
    </li>
  );
}

/* "A. text" lines (a choice may run over several lines) → [{ letter, text }]. */
function choiceItems(quote) {
  const items = [];
  for (const line of quote.split("\n")) {
    const match = /^([A-Z])\. (.*)$/.exec(line);
    if (match) items.push({ letter: match[1], text: match[2] });
    else if (items.length) items.at(-1).text += `\n${line}`;
    else items.push({ letter: "", text: line });
  }
  return items;
}

const COPIED_MS = 2000;

/* Wraps each code block so it gets a Copy button in its top-right corner. */
function withCodeCopyButtons(html) {
  if (!html.includes("<pre")) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const pre of template.content.querySelectorAll("pre")) {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-code";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-code__copy";
    button.setAttribute("data-copy-code", "");
    button.setAttribute("aria-label", "Copy code");
    button.title = "Copy code";
    button.textContent = "Copy";
    pre.replaceWith(wrapper);
    wrapper.append(button, pre);
  }
  return template.innerHTML;
}

/* The whole answer for the clipboard: its Markdown, then its sources (if any). */
function answerText(content, chips) {
  if (chips.length === 0) return content;
  return `${content}\n\nSources:\n${chips.map((chip) => `- ${chip.loc} · ${chip.doc}`).join("\n")}`;
}

function CopyAnswerButton({ text, onCopy }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm chat-answer__copy"
      aria-label={copied ? "Answer copied" : "Copy answer"}
      title="Copy answer"
      onClick={async () => setCopied(await onCopy(text, "Answer"))}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* Shown when the clipboard can't be used: the text, selected, to copy with ⌘C / Ctrl+C. */
function CopyFallbackDialog({ text, onClose }) {
  return (
    <Modal title="Copy manually" width={560} onClose={onClose}>
      <div className="confirm">
        <p className="confirm__text" id="copy-fallback-hint">
          Copying to the clipboard isn’t available here. The text is selected below — press ⌘C (Mac) or Ctrl+C to copy it.
        </p>
        <textarea
          className="chat-copy-fallback"
          aria-label="Text to copy"
          aria-describedby="copy-fallback-hint"
          readOnly
          value={text}
          rows={10}
          ref={(node) => node?.select()}
        />
        <div className="confirm__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
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
