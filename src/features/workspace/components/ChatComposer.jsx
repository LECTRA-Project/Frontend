import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { cellContextLabel, lineCount } from "../../../services/notebook/cellContext.js";

const CELL_ICONS = { code: "code", markdown: "text", raw: "fileText" };

/*
  The message box at the bottom of the Study Assistant panel.
  + opens the shared upload dialog; the send button (or Enter) calls onSend(text).

  Notebook cells dropped on the Study Assistant panel (which handles the drop, see
  StudyAssistantPanel) are listed above the input as removable context, separately from
  attached files. `cellDragActive` / `dropOver` highlight the composer as the drop target.
  Dropping a cell never runs it or sends anything; only Send does.
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
}) {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0;
  const hasContext = cellContext.length > 0 || attachments.length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }

  const dropClass = dropOver ? "composer--drop-over" : cellDragActive ? "composer--drop-ready" : "";

  return (
    <form className={`composer ${dropClass}`} onSubmit={handleSubmit}>
      {(cellDragActive || dropOver) && (
        <p className="composer__drop-hint" aria-hidden="true">
          <Icon name="plus" size={14} />
          Drop to add this cell to your question
        </p>
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

      {hasContext && !connected && (
        <p className="composer__note">
          The assistant isn’t connected yet, so a message won’t get an answer. You can still prepare your question.
        </p>
      )}

      <div className="composer__box">
        <IconButton icon="plus" label="Add files" outlined onClick={onAttachClick} />
        <label className="visually-hidden" htmlFor="composer-input">
          Message to the study assistant
        </label>
        <input
          id="composer-input"
          className="composer__input"
          placeholder="Ask about your materials…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="composer__send" aria-label="Send message" disabled={!canSend}>
          <Icon name="send" />
        </button>
      </div>
    </form>
  );
}
