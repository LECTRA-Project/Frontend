import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";

/*
  The message box at the bottom of the Study Assistant panel.
  + opens the shared upload dialog; the send button (or Enter) calls onSend(text).
*/
export default function ChatComposer({ attachments, onSend, onAttachClick, onRemoveAttachment }) {
  const [text, setText] = useState("");
  const canSend = text.trim().length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      {attachments.length > 0 && (
        <ul className="composer__files" aria-label="Attached files">
          {attachments.map((file) => (
            <li key={file.id} className="composer__file">
              <span>{file.name}</span>
              <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemoveAttachment(file.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
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
