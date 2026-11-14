import { useLayoutEffect, useRef, useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import ModelPicker from "./ModelPicker.jsx";
import { cellContextLabel, lineCount } from "../../../services/notebook/cellContext.js";
import { useI18n } from "../../../i18n/i18n.js";

const CELL_ICONS = { code: "code", markdown: "text", raw: "fileText" };

/*
  The message box under the chat, as wide as the conversation.
  The text area is on top; below it + uploads a material into this chat, the scope chip
  names the chat's materials (it opens the menu that lists them), and Send (or Enter) calls
  onSend(text). Shift+Enter adds a new line; the box grows with its text (up to a few lines).

  Notebook cells dropped on the chat (which handles the drop) are listed above the input
  as removable context. `cellDragActive` / `dropOver` highlight the composer as the drop
  target. Dropping a cell never runs it or sends anything; only Send does.
  `note` is shown above the input (e.g. why sending is blocked). onSend may return false
  to keep the typed text.

  Props:
    scope   { label, onClick } for the materials chip, or null
    model   what useChatModel() returns: the model button beside the chip (none: no button)
*/
export default function ChatComposer({
  cellContext = [],
  cellDragActive = false,
  onSend,
  onAttachClick,
  dropOver = false,
  onRemoveCell,
  disabled = false,
  attachDisabled = false,
  dropHint: dropHintProp,
  note = null,
  placeholder: placeholderProp,
  scope = null,
  model = null,
}) {
  const { t } = useI18n();
  const dropHint = dropHintProp ?? t("Drop to add this cell to your question");
  const placeholder = placeholderProp ?? t("Ask about this chat's materials…");
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
    <form className={`composer ${dropClass}`} onSubmit={handleSubmit}>
      {(cellDragActive || dropOver) && (
        <p className="composer__drop-hint" aria-hidden="true">
          <Icon name="plus" size={14} />
          {dropHint}
        </p>
      )}

      {cellContext.length > 0 && (
        <div className="composer__section">
          <p className="composer__section-title" id="composer-cells-title">
            {t("Notebook cells")}
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
                    <span className="composer__cell-meta">{lines === 1 ? t("1 line") : t("{count} lines", { count: lines })}</span>
                    <button
                      type="button"
                      className="composer__remove"
                      aria-label={t("Remove {label} from your message", { label })}
                      onClick={() => onRemoveCell(item.id)}
                    >
                      ×
                    </button>
                  </div>
                  {/* The full source, scrollable — never cut off. */}
                  <pre className="composer__cell-source" tabIndex={0} aria-label={t("Source of {label}", { label })}>
                    {item.source || t("(empty cell)")}
                  </pre>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {note && (
        <p className="composer__note" role="status">
          {note}
        </p>
      )}

      <div className="composer__box">
        <label className="visually-hidden" htmlFor="composer-input">
          {t("Message to the study assistant")}
        </label>
        <textarea
          ref={inputRef}
          id="composer-input"
          className="composer__input"
          placeholder={placeholder}
          value={text}
          rows={2}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          maxLength={2000}
        />
        <div className="composer__row">
          <IconButton
            icon="plus"
            label={t("Upload a material to this chat")}
            outlined
            className="composer__attach"
            onClick={onAttachClick}
            disabled={attachDisabled}
          />
          {scope && (
            <button type="button" className="composer__scope" onClick={scope.onClick} title={t("Materials in this chat")}>
              <Icon name="fileText" size={15} />
              <span>{scope.label}</span>
            </button>
          )}
          {model && <ModelPicker model={model} disabled={attachDisabled} />}
          <span className="composer__spacer" />
          <button type="submit" className="composer__send" aria-label={t("Send message")} disabled={!canSend}>
            <Icon name="arrowUp" />
          </button>
        </div>
      </div>
    </form>
  );
}
