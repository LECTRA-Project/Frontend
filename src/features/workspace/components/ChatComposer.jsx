import { useLayoutEffect, useRef, useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { cellContextLabel, lineCount } from "../../../services/notebook/cellContext.js";

const CELL_ICONS = { code: "code", markdown: "text", raw: "fileText" };

/*
  The message box at the bottom of the Study Assistant panel.
  + opens the shared upload dialog; the send button (or Enter) calls onSend(text).
  Shift+Enter adds a new line; the box grows with its text (up to a few lines).

  Notebook cells dropped on the Study Assistant panel (which handles the drop, see
  StudyAssistantPanel) are listed above the input as removable context, separately from
  attached files. `cellDragActive` / `dropOver` highlight the composer as the drop target.
  Dropping a cell never runs it or sends anything; only Send does.
  `note` is shown above the input (e.g. why sending is blocked). onSend may return false
  to keep the typed text.
*/
export default function ChatComposer({
  attachments,
  cellContext = [],
  cellDragActive = false,
  connected = false,
  onSend,
  onAttachClick,
  onRemoveAttachment,
  dropOver = false,
  onRemoveCell,
  disabled = false,
  materials = [],
  onRemoveMaterial = () => {},
  dropHint = "Drop to add this cell to your question",
  dropInvalid = false,
  note = null,
  placeholder = "Ask about your materials…",
}) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  // Grow the box with its text (CSS max-height caps it, then it scrolls).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [text]);
  const canSend = text.trim().length > 0 && !disabled;
  const hasContext = cellContext.length > 0 || attachments.length > 0 || materials.length > 0;

  function submit() {
    if (!canSend) return;
    // onSend may return false to keep the text (e.g. the question is too long to send).
    if (onSend(text.trim()) !== false) setText("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    submit();
  }

  // Enter sends; Shift+Enter (or Enter while composing with an IME) adds a new line.
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const dropClass = dropOver ? "composer--drop-over" : cellDragActive ? "composer--drop-ready" : "";

  return (
    <form className={`composer ${dropClass} ${dropInvalid ? "composer--drop-invalid" : ""}`} onSubmit={handleSubmit}>
      {(cellDragActive || dropOver) && (
        <p className="composer__drop-hint" aria-hidden="true">
          <Icon name={dropInvalid ? "close" : "plus"} size={14} />
          {dropHint}
        </p>
      )}

      {materials.length > 0 && (
        <div className="composer__section">
          <p className="composer__section-title" id="composer-materials-title">
            Course materials
          </p>
          <ul className="composer__materials" aria-labelledby="composer-materials-title">
            {materials.map((item) => (
              <li key={item.id} className="composer__material">
                <Icon name="fileText" size={14} />
                <span className="composer__material-name">{item.fileName}</span>
                <span className="composer__material-type">{item.typeLabel}</span>
                <button
                  type="button"
                  className="composer__remove"
                  aria-label={`Remove ${item.fileName} from your message`}
                  onClick={() => onRemoveMaterial(item.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="composer__material-note">The assistant will answer from these materials only.</p>
        </div>
      )}

      {cellContext.length > 0 && (
        <div className="composer__section">
          <p className="composer__section-title" id="composer-cells-title">
            Notebook cells
          </p>
          <ul className="composer__cells" aria-labelledby="composer-cells-title">
            {cellContext.map((item) => {
              const label = cellContextLabel(item);
              const lines = lineCount(item.source);
              return (
                <li key={item.id} className="composer__cell">
                  <div className="composer__cell-head">
                    <Icon name={CELL_ICONS[item.cellType]} size={14} />
                    <span className="composer__cell-label">{label}</span>
                    <span className="composer__cell-meta">
                      {lines === 1 ? "1 line" : `${lines} lines`}
                    </span>
                    <button
                      type="button"
                      className="composer__remove"
                      aria-label={`Remove ${label} from your message`}
                      onClick={() => onRemoveCell(item.id)}
                    >
                      ×
                    </button>
                  </div>
                  {/* The full source, scrollable — never cut off. */}
                  <pre className="composer__cell-source" tabIndex={0} aria-label={`Source of ${label}`}>
                    {item.source || "(empty cell)"}
                  </pre>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="composer__section">
          <p className="composer__section-title" id="composer-files-title">
            Files
          </p>
          <ul className="composer__files" aria-labelledby="composer-files-title">
            {attachments.map((file) => (
              <li key={file.id} className="composer__file">
                <span>{file.name}</span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemoveAttachment(file.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {note && (
        <p className="composer__note" role="status">
          {note}
        </p>
      )}

      {hasContext && !connected && (
        <p className="composer__note">
          The assistant isn’t available on this server yet, so a message won’t get an answer. You can still prepare your question.
        </p>
      )}

      <div className="composer__box">
        <IconButton icon="plus" label="Upload materials" outlined onClick={onAttachClick} />
        <label className="visually-hidden" htmlFor="composer-input">
          Message to the study assistant
        </label>
        <textarea
          ref={inputRef}
          id="composer-input"
          className="composer__input"
          placeholder={placeholder}
          value={text}
          rows={1}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          maxLength={2000}
        />
        <button type="submit" className="composer__send" aria-label="Send message" disabled={!canSend}>
          <Icon name="send" />
        </button>
      </div>
    </form>
  );
}
