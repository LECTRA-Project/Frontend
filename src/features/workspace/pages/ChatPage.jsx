import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import Icon from "../../../components/ui/Icon.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import ChatComposer from "../components/ChatComposer.jsx";
import { renderAnswerMarkdown, renderMarkdown } from "../../../services/notebook/markdown.js";
import { hasDiagrams, renderDiagrams } from "../../../services/notebook/diagrams.js";
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
import { t, useI18n } from "../../../i18n/i18n.js";
import useTypewriter from "../useTypewriter.js";
import { MAX_MESSAGE_LENGTH } from "../../../api/services/chat.js";

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
  - While the assistant answers, a bubble with animated dots shows where the answer will
    appear; a new answer is then typed out word by word (useTypewriter.js).
  - Every question has Copy (its text) and Edit, which sends the edited question again as
    a new message (StudentMessage). A question that failed shows the error with "Try again"
    (onRetry(error message)), which asks the same question again.
  - Every code block in an answer has a Copy button (just that code), and every answer has a
    Copy button under it (the whole answer as Markdown, with its sources). When the
    clipboard can't be used, a dialog shows the text selected for copying by hand.
  - The latest answer from the materials ends with the assistant's suggestion of the next
    step ("Shall I explain the next section …?") and a "Yes, please" button that asks for it.
    With weak topics (an exam answer went wrong) it offers two next steps instead, "Review: …"
    and "Continue with: …", as buttons that send their own text. When a typed "yes" doesn't
    say which, the assistant asks back and both buttons stay.
  - A chat in a project shows the project's name in the bar (it opens the project page). Its
    materials are the project's. Renaming, moving and deleting a chat are in its ⋯ in the menu
    (ChatSidebar), so the bar has no ⋯ of its own.
  - The materials chip in the composer opens the chat's material in the viewer (with several,
    it lists them to choose from).
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
  onOpenMaterial = () => {},
  onSend,
  onOpenProject = () => {},
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
  onResend = () => false,
  onRetry = null,
  model = null,
}) {
  const { t } = useI18n();
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const [copyFallback, setCopyFallback] = useState(null); // text to copy by hand
  const [copyNote, setCopyNote] = useState({ text: "", seq: 0 }); // for screen readers
  const scrollRef = useRef(null);
  const slow = useSlow(busy, 15000);
  const dropOver = nativeDragOver || cellDragOver;
  const title = displayChatTitle(session?.title) ?? t("New chat");
  const count = materials.length;
  const empty = !loading && messages.length === 0;
  // Only the latest answer offers its suggestion, and only while a question can be sent.
  const lastMessage = messages.at(-1);
  const suggesting =
    !busy &&
    available === true &&
    lastMessage?.role === "assistant" &&
    (lastMessage.suggestion || lastMessage.review_suggestion)
      ? lastMessage.id
      : null;

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

  // While an answer is typed out: follow it, unless the student scrolled up to read.
  const followAnswer = useCallback(() => {
    const body = scrollRef.current;
    if (!body) return;
    if (body.scrollHeight - body.scrollTop - body.clientHeight < FOLLOW_PX) body.scrollTop = body.scrollHeight;
  }, []);

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

  // Copies text; on failure shows it in a dialog for copying by hand. Resolves to success.
  // `done` is announced to screen readers once copied ("Answer copied.").
  async function copy(text, done) {
    const copied = await copyText(text);
    if (copied) setCopyNote((note) => ({ text: done, seq: note.seq + 1 }));
    else setCopyFallback(text);
    return copied;
  }

  const scopeLabel = count === 1 ? materials[0].name : t("{count} materials", { count });
  const status =
    count === 0
      ? t("No materials in this chat yet.")
      : count === 1
        ? t("1 material ready in this chat.")
        : t("{count} materials ready in this chat.", { count });

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
        <h1 id="chat-title" className="chat__title" title={title}>
          {title}
        </h1>
        {examLink && (
          <Link to={examLink} className="btn btn--secondary btn--sm chat__exam-link" aria-label={t("Back to exam results")}>
            <Icon name="arrowLeft" size={14} />
            <span className="chat__exam-link-long">{t("Back to exam results")}</span>
            <span className="chat__exam-link-short" aria-hidden="true">
              {t("Exam results")}
            </span>
          </Link>
        )}
        {session?.project && (
          <button
            type="button"
            className="project-tag project-tag--button chat__project"
            title={t("Open the project {name}", { name: session.project.name })}
            aria-label={t("Open the project {name}", { name: session.project.name })}
            onClick={() => onOpenProject(session.project.id)}
          >
            <Icon name="folder" size={13} />
            <span className="project-tag__name">{session.project.name}</span>
          </button>
        )}
      </div>

      <div className="chat__scroll" ref={scrollRef} onScroll={handleScroll}>
        {loading ? (
          <p className="chat__loading" role="status">
            {t("Loading the chat…")}
          </p>
        ) : empty ? (
          <div className="chat__empty">
            <h2 className="chat__empty-title">{t("What are we studying today?")}</h2>
            <p className="chat__empty-text">
              {available === false
                ? t("This server has no chat assistant yet, so questions can’t be answered here.")
                : session?.project
                  ? t("This chat is in the project {name} and answers from the project’s materials.", { name: session.project.name })
                  : t(
                    "Each chat has its own materials. Upload the lectures for this chat and the answers will come from them, with the pages they are based on.",
                  )}
            </p>
            <span className="chat__empty-status">{status}</span>
          </div>
        ) : (
          <ol className="chat__thread" aria-label={t("Messages")} aria-live="polite">
            {olderMessages && (
              <li className="chat__older">
                <button type="button" className="cf-link-button" onClick={onLoadOlder} disabled={loadingOlder}>
                  {loadingOlder ? t("Loading earlier messages…") : t("Show earlier messages")}
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
                onGrow={followAnswer}
                onSuggest={message.id === suggesting ? onSend : null}
                onResend={onResend}
                onRetry={onRetry}
                canResend={!busy && available === true}
              />
            ))}
            {busy && (
              // Waiting for the answer: a bubble where it will appear, with animated dots.
              <li className="chat-msg chat-msg--assistant chat-msg--thinking" role="status">
                <span className="chat-thinking__dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="chat-thinking__label">
                  {slow ? t("Still working — the AI can take a minute or two when it’s busy…") : t("Reading your materials…")}
                </span>
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
          scope={count > 0 ? { label: scopeLabel, materials, onOpen: onOpenMaterial } : null}
          model={model}
        />
      </div>

      <p className="visually-hidden" role="status">
        <span key={announcement.seq}>{announcement.text}</span>
      </p>
      <p className="visually-hidden" role="status">
        <span key={copyNote.seq}>{copyNote.text}</span>
      </p>

      {copyFallback !== null && <CopyFallbackDialog text={copyFallback} onClose={() => setCopyFallback(null)} />}

    </section>
  );
}

/*
  A question the student sent, with Copy and Edit under it (shown on hover or focus, always
  on touch screens). Edit turns the bubble into a text box; Send asks the edited question
  as a new message at the end of the chat (the backend can't change a sent message), with
  the notebook cells the question had. Questions from the exam results can be copied only.
*/
function StudentMessage({ message, onCopy, onResend, canResend }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(null); // the text being edited, or null
  const [copied, setCopied] = useState(false);
  const exam = parseExamQuestionMessage(message.content);
  // Notebook cells added to the question are shown as code cards, not as the raw text block.
  const { text, cells } = exam ? { text: message.content, cells: [] } : parseNotebookContext(message.content);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    setCopied(await onCopy(text, t("Message copied.")));
  }

  function send(event) {
    event?.preventDefault();
    const value = draft.trim();
    if (!value || !canResend) return;
    // The notebook block (if any) follows the typed text in the message: keep it.
    if (onResend(value + message.content.slice(text.length)) !== false) setDraft(null);
  }

  const pending = message.pending ? "chat-msg--pending" : "";
  return (
    <li className="chat-turn chat-turn--student">
      {draft !== null ? (
        <form className="chat-edit" onSubmit={send}>
          <label className="visually-hidden" htmlFor={`edit-${message.id}`}>
            {t("Edit your message")}
          </label>
          <textarea
            id={`edit-${message.id}`}
            className="chat-edit__input"
            value={draft}
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            maxLength={MAX_MESSAGE_LENGTH}
            autoFocus
            onFocus={(event) => event.currentTarget.setSelectionRange(draft.length, draft.length)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDraft(null);
              if (event.key === "Enter" && !event.shiftKey) send(event);
            }}
          />
          {cells.length > 0 && (
            <p className="chat-edit__note">
              {cells.length === 1 ? t("The notebook cell is sent again too.") : t("The {count} notebook cells are sent again too.", { count: cells.length })}
            </p>
          )}
          <div className="chat-edit__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(null)}>
              {t("Cancel")}
            </button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={!draft.trim() || !canResend}>
              {t("Send")}
            </button>
          </div>
        </form>
      ) : exam ? (
        <ExamQuestionMessage message={message} exam={exam} />
      ) : (
        <div className={`chat-msg chat-msg--student ${pending}`}>
          <span className="chat-msg__text">{text}</span>
          {cells.length > 0 && (
            <ul className="chat-cells" aria-label={t("Notebook cells added to this question")}>
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
        </div>
      )}
      {draft === null && !message.pending && (
        <div className="chat-msg__actions">
          <button
            type="button"
            className="btn btn--ghost btn--sm chat-msg__action"
            aria-label={copied ? t("Message copied") : t("Copy message")}
            title={t("Copy message")}
            onClick={copy}
          >
            <Icon name={copied ? "check" : "copy"} size={14} />
            {copied ? t("Copied") : t("Copy")}
          </button>
          {!exam && (
            <button
              type="button"
              className="btn btn--ghost btn--sm chat-msg__action"
              aria-label={t("Edit message")}
              title={canResend ? t("Edit and send again") : t("Wait for the answer before editing")}
              disabled={!canResend}
              onClick={() => setDraft(text)}
            >
              <Icon name="edit" size={14} />
              {t("Edit")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ChatMessage({ message, materialType, lectureTitle, onOpenSource, onUploadAgain, onCopy, onGrow, onSuggest, onResend, onRetry, canResend }) {
  const { t } = useI18n();
  if (message.role === "system") {
    return (
      <li className="chat-msg chat-msg--system" role="alert">
        {message.content}
        {/* A failed question: ask it again in one click. */}
        {message.retry && onRetry && (
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm chat-msg__action"
              disabled={!canResend}
              onClick={() => onRetry(message)}
            >
              <Icon name="refresh" size={14} />
              {t("Try again")}
            </button>
          </div>
        )}
      </li>
    );
  }
  if (message.role === "user") {
    return <StudentMessage message={message} onCopy={onCopy} onResend={onResend} canResend={canResend} />;
  }
  if (message.content.startsWith(NO_TEXT_ANSWER)) {
    return (
      <li className="chat-msg chat-msg--assistant chat-msg--no-text" role="note">
        <p className="chat-msg__no-text-title">
          <Icon name="alert" size={14} />
          {t("This chat’s materials have no readable text saved")}
        </p>
        <p>
          {t(
            "The assistant can only answer from text read from the files when they were uploaded. Scanned PDFs (pages that are images) have no text to read.",
          )}
        </p>
        <button type="button" className="cf-link-button" onClick={onUploadAgain}>
          {t("Upload the file again")}
        </button>
      </li>
    );
  }
  return (
    <AssistantAnswer
      message={message}
      materialType={materialType}
      lectureTitle={lectureTitle}
      onOpenSource={onOpenSource}
      onCopy={onCopy}
      onGrow={onGrow}
      onSuggest={onSuggest}
    />
  );
}

/*
  An answer. One that just arrived (message.fresh) is typed out word by word
  (useTypewriter); its sources, Copy button and suggestion fade in once it is complete.
  `onSuggest` (sends a message) is set on the latest answer only: it then shows its suggestion.
  An answer that asks which next step the student wants (asks_choice) has no sources but is
  not general knowledge, so it has no "Not from your materials" label.
*/
function AssistantAnswer({ message, materialType, lectureTitle, onOpenSource, onCopy, onGrow, onSuggest }) {
  const { t } = useI18n();
  const { text, typing } = useTypewriter(message.id, message.content, message.fresh);
  const chips = sourceChips(message.sources, materialType, lectureTitle);

  // Keep the growing answer in view while it is typed.
  useLayoutEffect(() => {
    if (typing) onGrow?.();
  }, [text, typing, onGrow]);

  // A code block's Copy button (in the answer's HTML): copies only that block's code.
  async function handleAnswerClick(event) {
    const button = event.target.closest?.("[data-copy-code]");
    if (!button) return;
    // Without the line break Markdown adds after the last line.
    const code = (button.parentElement.querySelector("pre")?.textContent ?? "").replace(/\n$/, "");
    const copied = await onCopy(code, t("Code copied."));
    if (!copied) return;
    button.textContent = t("Copied");
    button.dataset.copied = "";
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => {
      button.textContent = t("Copy");
      delete button.dataset.copied;
    }, COPIED_MS);
  }

  return (
    // aria-busy: screen readers read the answer once, when it is complete.
    <li className={`chat-msg chat-msg--assistant ${message.fresh ? "chat-msg--fresh" : ""}`} aria-busy={typing || undefined}>
      <article className="chat-answer">
        {chips.length === 0 && !message.asks_choice && (
          <span className="chat-answer__general">
            <Icon name="alert" size={14} />
            {t("Not from your materials")}
          </span>
        )}
        <AnswerBody
          html={withCodeCopyButtons(renderAnswerMarkdown(text))}
          typing={typing}
          onClick={handleAnswerClick}
        />
        {!typing && (
          <AnswerFooter
            chips={chips}
            content={message.content}
            suggestion={onSuggest ? message.suggestion : null}
            review={onSuggest ? message.review_suggestion : null}
            onSuggest={onSuggest}
            onOpenSource={onOpenSource}
            onCopy={onCopy}
          />
        )}
      </article>
    </li>
  );
}

/*
  The answer's sources, Copy button and suggestion (shown once the answer is complete).
  One suggestion: its text and "Yes, please", which sends "Yes, please". With weak topics the
  backend offers two next steps instead (`review` and `suggestion`, issue #169), written as
  the messages to send: each is a button that sends its own text, like suggestion chips.
*/
function AnswerFooter({ chips, content, suggestion = null, review = null, onSuggest = null, onOpenSource, onCopy }) {
  const { t } = useI18n();
  const options = review && suggestion ? [review, suggestion] : null;
  const single = options ? null : suggestion || review;
  return (
    <>
      {chips.length > 0 && (
        <ul className="chat-sources" aria-label={t("Sources")}>
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                className="chat-source"
                title={t("Open this page beside the chat")}
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
        <CopyAnswerButton text={answerText(content, chips)} onCopy={onCopy} />
      </div>
      {options && (
        <div className="chat-suggestion chat-suggestion--choice" role="group" aria-label={t("Choose your next step")}>
          <span className="chat-suggestion__label">
            <Icon name="arrowRight" size={14} />
            {t("Next step")}
          </span>
          {options.map((option, index) => (
            <button key={option} type="button" className="chat-suggestion__option" onClick={() => onSuggest(option)}>
              <Icon name={index === 0 ? "refresh" : "arrowRight"} size={14} />
              <span>{option}</span>
            </button>
          ))}
        </div>
      )}
      {single && (
        <div className="chat-suggestion">
          <span className="chat-suggestion__label">
            <Icon name="arrowRight" size={14} />
            {t("Next step")}
          </span>
          <p className="chat-suggestion__text">{single}</p>
          <button
            type="button"
            className="btn btn--secondary btn--sm chat-suggestion__accept"
            onClick={() => onSuggest(t("Yes, please"))}
          >
            {t("Yes, please")}
          </button>
        </div>
      )}
    </>
  );
}

/*
  A question asked from the exam results: the heading line, then each part under its label,
  quoted. The exam's texts (question, choices, feedback) are Markdown, as in the results;
  the student's own answer is plain text.
*/
function ExamQuestionMessage({ message, exam }) {
  const { t } = useI18n();
  return (
    <div className={`chat-msg chat-msg--student chat-msg--exam ${message.pending ? "chat-msg--pending" : ""}`}>
      <span className="chat-exam__from">
        <Icon name="graduation" size={14} />
        {t("From your exam results")}
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
    </div>
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
// How close to the bottom (px) the chat must be to follow an answer being typed.
const FOLLOW_PX = 160;

/*
  The answer's HTML; ```mermaid blocks in it are turned into diagrams once it is shown in
  full (not while it is being typed, when a diagram is still incomplete).
*/
function AnswerBody({ html, typing = false, onClick }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!typing && hasDiagrams(ref.current)) renderDiagrams(ref.current);
  }, [html, typing]);
  return (
    // The click handler only serves the code blocks' Copy buttons (native buttons, so keyboard works).
    <div
      ref={ref}
      className={`chat-msg__md markdown-body ${typing ? "chat-msg__md--typing" : ""}`}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

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
    button.setAttribute("aria-label", t("Copy code"));
    button.title = t("Copy code");
    button.textContent = t("Copy");
    pre.replaceWith(wrapper);
    wrapper.append(button, pre);
  }
  return template.innerHTML;
}

/* The whole answer for the clipboard: its Markdown, then its sources (if any). */
function answerText(content, chips) {
  if (chips.length === 0) return content;
  return `${content}\n\n${t("Sources:")}\n${chips.map((chip) => `- ${chip.loc} · ${chip.doc}`).join("\n")}`;
}

function CopyAnswerButton({ text, onCopy }) {
  const { t } = useI18n();
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
      aria-label={copied ? t("Answer copied") : t("Copy answer")}
      title={t("Copy answer")}
      onClick={async () => setCopied(await onCopy(text, t("Answer copied.")))}
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? t("Copied") : t("Copy")}
    </button>
  );
}

/* Shown when the clipboard can't be used: the text, selected, to copy with ⌘C / Ctrl+C. */
function CopyFallbackDialog({ text, onClose }) {
  const { t } = useI18n();
  return (
    <Modal title={t("Copy manually")} width={560} onClose={onClose}>
      <div className="confirm">
        <p className="confirm__text" id="copy-fallback-hint">
          {t("Copying to the clipboard isn’t available here. The text is selected below — press ⌘C (Mac) or Ctrl+C to copy it.")}
        </p>
        <textarea
          className="chat-copy-fallback"
          aria-label={t("Text to copy")}
          aria-describedby="copy-fallback-hint"
          readOnly
          value={text}
          rows={10}
          ref={(node) => node?.select()}
        />
        <div className="confirm__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            {t("Done")}
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
  const { t } = useI18n();
  const lines = lineCount(cell.source);
  return (
    <li className={`chat-cell chat-cell--${cell.cellType}`}>
      <details open={lines <= OPEN_CELL_LINES}>
        <summary className="chat-cell__head">
          <Icon name={cell.cellType === "code" ? "code" : "text"} size={14} />
          <span className="chat-cell__label">{cell.label}</span>
          {cell.notebookTitle && <span className="chat-cell__meta">· {cell.notebookTitle}</span>}
          <span className="chat-cell__meta chat-cell__lines">
            {lines === 1 ? t("1 line") : t("{count} lines", { count: lines })}
          </span>
        </summary>
        <pre className="chat-cell__code">
          <code>{cell.source}</code>
        </pre>
      </details>
    </li>
  );
}
