import { useEffect, useRef, useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";
import ChatComposer from "./ChatComposer.jsx";
import { MAX_MESSAGE_LENGTH } from "../../../api/services/chat.js";
import { renderMarkdown } from "../../../services/notebook/markdown.js";
import { withNotebookContext } from "../../../services/studyAssistant.js";
import { cellContextLabel, toAssistantContext } from "../../../services/notebook/cellContext.js";
import { useLectureChat } from "../useLectureChat.js";

// The backend's fixed answer when the lecture has no extracted text saved (student_profile/chat/service.py).
// Text is extracted only at upload, so lectures uploaded before extraction existed, scanned
// (image-only) PDFs and files that failed to parse all end up here.
export const NO_TEXT_ANSWER = "The selected lectures have no readable text yet";

// Where a cited page_number points, by material type (the backend numbers pages, slides and cells alike).
const SOURCE_TYPES = { pdf: "page", slides: "slide", notebook: "cell", notes: "section" };

/*
  The Study Assistant's saved lecture chats (Lecture Chat API, see useLectureChat).

  Every chat is about exactly one lecture — the one open in the viewer (focusLectureId).
  To chat about another lecture, the student opens it from Course materials:
    - the first question creates the chat (the backend names it after that question);
    - if the open chat is about another lecture than the one in the viewer, sending starts
      a new chat about the viewer's lecture; with nothing open, the open chat continues;
    - a course material dragged onto the assistant becomes the lecture to ask about;
    - notebook cells dragged in are appended to the question as reference context.
  Recent chats opens (also opening its lecture in the viewer), renames and deletes earlier
  chats. Answers list the pages they cite; clicking one opens the lecture there.

  Props: see StudyAssistantPanel (this is its body when the server has the chat API).
*/
export default function LectureChat({
  materials,
  focusLectureId,
  onOpenLecture,
  onOpenReference,
  cellContext,
  materialContext,
  onSent,
  composerProps,
}) {
  const chat = useLectureChat({ enabled: true });
  const [view, setView] = useState("chat"); // "chat" | "history"
  const [renaming, setRenaming] = useState(null); // { id, title }
  const [deleting, setDeleting] = useState(null); // session
  const [listError, setListError] = useState(null);
  const [tooLong, setTooLong] = useState(null); // message when question + notebook cells exceed the limit
  const bodyRef = useRef(null);
  const slow = useSlow(chat.busy, 15000);

  const usable = materials.filter((item) => (item.status ?? "completed") === "completed" && SOURCE_TYPES[item.type]);
  const typeOf = (lectureId) => materials.find((item) => item.id === lectureId)?.type;

  // The lecture the next question is about: a dropped material, else the one in the viewer,
  // else the open chat's.
  const session = chat.activeSession;
  const dropped = materialContext.length === 1 ? materialContext[0] : null;
  const viewed = materials.find((item) => item.id === focusLectureId) ?? null;
  const viewedUsable = viewed !== null && usable.includes(viewed);
  const lectureId = dropped?.lectureId ?? (viewedUsable ? viewed.id : null) ?? session?.lecture?.id ?? null;
  const lectureName = dropped?.fileName ?? (viewedUsable ? viewed.name : null) ?? session?.lecture?.title ?? null;
  const startsNewChat = Boolean(session && lectureId && lectureId !== session.lecture?.id);

  const question = (text) => withNotebookContext(text, cellContext.map(toAssistantContext));

  let blocked = null;
  if (materialContext.length > 1) blocked = "A chat answers from one lecture at a time. Keep one course material and remove the others.";
  else if (viewed && !viewedUsable && !dropped)
    blocked = `“${viewed.name}” can’t be chatted about${viewed.status && viewed.status !== "completed" ? " until it’s processed" : ""}. Open a PDF, slides or notebook from Course materials.`;
  else if (session && !session.lecture && !lectureId) blocked = "The lecture of this chat was deleted. Open a lecture from Course materials to keep asking.";
  else if (!lectureId)
    blocked = materials.length ? "Open a lecture from Course materials to chat about it." : "Upload a PDF, slides or a notebook to start a chat.";

  let note = blocked ?? tooLong;
  if (!note && startsNewChat) note = `Sending starts a new chat about “${lectureName}”.`;

  // Keep the newest message in view.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [chat.messages, chat.busy]);

  // Returns false (the composer then keeps the text) when the question can't be sent as is.
  function handleSend(text) {
    const content = question(text);
    if (content.length > MAX_MESSAGE_LENGTH) {
      setTooLong(
        `Your question with the added notebook cells is ${content.length} characters; the limit is ${MAX_MESSAGE_LENGTH}. Remove a cell or shorten the question.`
      );
      return false;
    }
    setTooLong(null);
    send(text, content);
    return true;
  }

  async function send(text, content) {
    const cells = cellContext;
    const attached = materialContext;
    const extras = [
      ...cells.map((cell) => `Notebook context: ${cellContextLabel(cell)}`),
      ...attached.map((item) => `Material: ${item.fileName}`),
    ];
    setView("chat");
    const ok = await chat.send({ lectureId, question: text, content, extras });
    // Clear the sent context only once answered; on failure it stays in the draft.
    if (ok) onSent({ cellIds: cells.map((cell) => cell.id), materialIds: attached.map((item) => item.id) });
  }

  function openSource(source) {
    const sourceType = SOURCE_TYPES[typeOf(source.lecture_id)] ?? "page";
    onOpenReference?.({ lecture_id: source.lecture_id, source_type: sourceType, source_number: source.page_number });
  }

  async function submitRename(event) {
    event.preventDefault();
    const title = renaming.title.trim();
    if (!title) return;
    try {
      await chat.rename(renaming.id, title);
      setRenaming(null);
      setListError(null);
    } catch (err) {
      setListError(err.message);
    }
  }

  async function confirmDelete() {
    const target = deleting;
    setDeleting(null);
    try {
      await chat.remove(target.id);
      setListError(null);
    } catch (err) {
      setListError(err.message);
    }
  }

  return (
    <>
      <div className="chat-bar">
        <button
          type="button"
          className={`chat-bar__toggle ${view === "history" ? "chat-bar__toggle--on" : ""}`}
          aria-pressed={view === "history"}
          onClick={() => setView((current) => (current === "history" ? "chat" : "history"))}
        >
          <Icon name="message" size={14} />
          Recent chats{chat.sessions.length ? ` (${chat.sessions.length})` : ""}
        </button>
        <span className="chat-bar__title" title={session?.title}>
          {view === "history" ? "Recent chats" : session ? session.title : "New chat"}
        </span>
        <button
          type="button"
          className="chat-bar__new"
          onClick={() => {
            chat.startNewChat();
            setView("chat");
          }}
          disabled={!session && view === "chat"}
        >
          <Icon name="plus" size={14} />
          New chat
        </button>
      </div>

      {view === "chat" && (lectureName || session) && (
        <div className="assistant__scope">
          <span>About</span>
          <span className="chat-bar__lecture">{lectureName ?? "Deleted lecture"}</span>
        </div>
      )}

      <div className="assistant__body" aria-live="polite" ref={bodyRef}>
        {view === "history" ? (
          <ChatHistory
            chat={chat}
            error={listError}
            renaming={renaming}
            setRenaming={setRenaming}
            onSubmitRename={submitRename}
            onDelete={setDeleting}
            onOpen={(id) => {
              chat.openSession(id);
              setView("chat");
              // Show the chat's lecture in the viewer, so new questions stay in this chat.
              const lecture = chat.sessions.find((item) => item.id === id)?.lecture;
              if (lecture && lecture.id !== focusLectureId) onOpenLecture?.(lecture.id);
            }}
          />
        ) : chat.messagesLoading ? (
          <p className="chat-msg chat-msg--system" role="status">
            Loading the chat…
          </p>
        ) : chat.messages.length === 0 ? (
          <div className="assistant__empty">
            <span className="assistant__empty-icon">
              <Icon name="message" />
            </span>
            <p className="assistant__empty-title">Ask about a lecture</p>
            <p className="assistant__empty-text">
              {usable.length
                ? "Answers come only from the lecture open in the viewer, with the pages they’re based on. Your chats are saved."
                : materials.length
                  ? "Your materials are still being processed. You can ask as soon as one shows Completed."
                  : "Upload PDFs, slides or notebooks, then ask questions about them here."}
            </p>
          </div>
        ) : (
          <ul className="assistant__messages">
            {chat.messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onOpenSource={openSource}
                onUploadAgain={composerProps.onAttachClick}
              />
            ))}
            {chat.busy && (
              <li className="chat-msg chat-msg--system" role="status">
                {slow ? "Still working — the AI can take a minute or two when it’s busy…" : "Reading the lecture…"}
              </li>
            )}
          </ul>
        )}
      </div>

      <ChatComposer
        {...composerProps}
        connected
        note={note}
        placeholder="Ask about this lecture…"
        onSend={handleSend}
        disabled={chat.busy || Boolean(blocked)}
      />

      {deleting && (
        <ConfirmDialog
          title="Delete chat?"
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          “{deleting.title}” and all its messages will be deleted. The lecture itself is kept.
        </ConfirmDialog>
      )}
    </>
  );
}

function ChatMessage({ message, onOpenSource, onUploadAgain }) {
  const role = message.role === "user" ? "student" : message.role;
  if (message.role === "assistant" && message.content.startsWith(NO_TEXT_ANSWER)) {
    return (
      <li className="chat-msg chat-msg--assistant chat-msg--no-text" role="note">
        <p className="chat-msg__no-text-title">
          <Icon name="alert" size={14} />
          This lecture has no readable text saved
        </p>
        <p>The assistant can only answer from text read from the file when it was uploaded. This happens when:</p>
        <ul>
          <li>it was uploaded before text reading was available — delete it and upload the file again;</li>
          <li>it is a scanned PDF (pages are images), which has no text to read;</li>
          <li>the file couldn’t be read when it was uploaded.</li>
        </ul>
        {onUploadAgain && (
          <button type="button" className="chat-bar__new" onClick={onUploadAgain}>
            <Icon name="upload" size={14} />
            Upload the file again
          </button>
        )}
      </li>
    );
  }
  // One entry per cited page.
  const sources = (message.sources ?? []).filter(
    (source, index, list) =>
      list.findIndex((other) => other.lecture_id === source.lecture_id && other.page_number === source.page_number) === index
  );
  return (
    <li className={`chat-msg chat-msg--${role}`}>
      {message.role === "assistant" ? (
        <div className="chat-msg__md markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
      ) : (
        <span className="chat-msg__text">{message.content}</span>
      )}
      {message.extras?.map((extra) => (
        <span key={extra} className="chat-msg__files">
          {extra}
        </span>
      ))}
      {sources.length > 0 && (
        <ol className="chat-sources" aria-label="Sources">
          {sources.map((source) => (
            <li key={`${source.lecture_id}-${source.page_number}`}>
              <button type="button" className="chat-source" onClick={() => onOpenSource(source)}>
                <span className="chat-source__id">p. {source.page_number}</span>
                <span className="chat-source__text">{source.lecture_title}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function ChatHistory({ chat, error, renaming, setRenaming, onSubmitRename, onDelete, onOpen }) {
  if (chat.sessionsLoading && chat.sessions.length === 0) {
    return (
      <p className="chat-msg chat-msg--system" role="status">
        Loading your chats…
      </p>
    );
  }
  if (chat.sessionsError && chat.sessions.length === 0) {
    return (
      <div className="assistant__empty">
        <p className="assistant__empty-text">{chat.sessionsError}</p>
        <button type="button" className="chat-bar__new" onClick={() => chat.reloadSessions()}>
          <Icon name="refresh" size={14} />
          Try again
        </button>
      </div>
    );
  }
  if (chat.sessions.length === 0) {
    return (
      <div className="assistant__empty">
        <p className="assistant__empty-title">No chats yet</p>
        <p className="assistant__empty-text">Ask a question about a lecture and the chat is saved here.</p>
      </div>
    );
  }
  return (
    <>
      {error && (
        <p className="chat-history__error" role="alert">
          {error}
        </p>
      )}
      <ul className="chat-history">
        {chat.sessions.map((session) => {
          const active = chat.activeSession?.id === session.id;
          if (renaming?.id === session.id) {
            return (
              <li key={session.id} className="chat-history__item chat-history__item--editing">
                <form className="chat-history__rename" onSubmit={onSubmitRename}>
                  <label className="visually-hidden" htmlFor={`rename-${session.id}`}>
                    Chat title
                  </label>
                  <input
                    id={`rename-${session.id}`}
                    value={renaming.title}
                    maxLength={255}
                    autoFocus
                    onChange={(event) => setRenaming({ id: session.id, title: event.target.value })}
                    onKeyDown={(event) => event.key === "Escape" && setRenaming(null)}
                  />
                  <IconButton icon="check" label="Save title" type="submit" disabled={!renaming.title.trim()} />
                  <IconButton icon="close" label="Cancel renaming" onClick={() => setRenaming(null)} />
                </form>
              </li>
            );
          }
          return (
            <li key={session.id} className={`chat-history__item ${active ? "chat-history__item--active" : ""}`}>
              <button
                type="button"
                className="chat-history__open"
                aria-current={active ? "true" : undefined}
                onClick={() => onOpen(session.id)}
              >
                <span className="chat-history__title">{session.title}</span>
                <span className="chat-history__meta">
                  {session.lecture ? session.lecture.title : "Deleted lecture"} · {formatWhen(session.updated_at)}
                </span>
              </button>
              <IconButton
                icon="edit"
                label={`Rename “${session.title}”`}
                onClick={() => setRenaming({ id: session.id, title: session.title })}
              />
              <IconButton icon="trash" label={`Delete “${session.title}”`} onClick={() => onDelete(session)} />
            </li>
          );
        })}
      </ul>
    </>
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

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}
