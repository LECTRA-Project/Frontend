import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import ChatComposer from "./ChatComposer.jsx";
import { ASSISTANT_CONNECTED, sendStudyMessage } from "../../../services/studyAssistant.js";
import {
  CELL_DROP_ZONE_ATTR,
  cellContextLabel,
  isCellDrag,
  readCellDrag,
  toAssistantContext,
} from "../../../services/notebook/cellContext.js";

/*
  Right panel: the Study Assistant.
  The assistant is NOT connected in this phase. Sending a message shows the student's
  own message and a note that it was not answered — no AI reply is generated.

  The LLM team connects the assistant in src/services/studyAssistant.js; this panel
  already shows `reply` when the service returns one.

  Props:
    attachments         files picked with the + button (from the shared upload dialog)
    cellContext         notebook cells added to the message (see services/notebook/cellContext.js)
    cellDragActive      a notebook cell is being dragged, so the composer shows its drop target
    cellDragOver        a touch/pen cell drag is over this panel (mouse drags are tracked here)
    announcement        { text, seq } screen-reader feedback about the draft
    onAttachClick       opens the shared upload dialog
    onRemoveAttachment  removes one attachment
    onAddCell           adds a dropped cell to the draft (the whole panel accepts the drop)
    onRemoveCell        removes one cell from the draft
    onSent              called with { attachmentIds, cellIds } once a message has been handled
*/
export default function StudyAssistantPanel({
  attachments,
  cellContext,
  cellDragActive,
  cellDragOver = false,
  announcement,
  onAttachClick,
  onRemoveAttachment,
  onAddCell,
  onRemoveCell,
  onSent,
}) {
  const [messages, setMessages] = useState([]);
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const dropOver = nativeDragOver || cellDragOver;

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

  async function handleSend(text) {
    const files = attachments;
    const cells = cellContext;
    setMessages((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        role: "student",
        text,
        files: files.map((f) => f.name),
        cells: cells.map(cellContextLabel),
      },
    ]);

    let result;
    try {
      result = await sendStudyMessage({ text, attachments: files, notebookCells: cells.map(toAssistantContext) });
    } catch (error) {
      // Keep the draft context so the student can try again.
      setMessages((list) => [
        ...list,
        { id: crypto.randomUUID(), role: "system", text: `The message couldn’t be sent (${error.message}).` },
      ]);
      return;
    }
    onSent({ attachmentIds: files.map((f) => f.id), cellIds: cells.map((cell) => cell.id) });

    const nextMessage = result.connected
      ? { id: crypto.randomUUID(), role: "assistant", text: result.reply }
      : { id: crypto.randomUUID(), role: "system", text: "The study assistant isn’t connected yet, so this message wasn’t answered." };
    setMessages((list) => [...list, nextMessage]);
  }

  return (
    <section
      className={`panel assistant ${dropOver ? "assistant--drop-over" : ""}`}
      aria-labelledby="assistant-title"
      {...{ [CELL_DROP_ZONE_ATTR]: "" }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="panel__header">
        <h2 id="assistant-title" className="panel__title">
          Study assistant
        </h2>
        <span className="pill">
          <span className="pill__dot" />
          {ASSISTANT_CONNECTED ? "Connected" : "Not connected yet"}
        </span>
      </div>

      <div className="assistant__body" aria-live="polite">
        {messages.length === 0 ? (
          <div className="assistant__empty">
            <span className="assistant__empty-icon">
              <Icon name="message" />
            </span>
            <p className="assistant__empty-title">Your study space</p>
            <p className="assistant__empty-text">
              This space is reserved for studying alongside your course materials. The assistant will be
              connected in a later phase.
            </p>
          </div>
        ) : (
          <ul className="assistant__messages">
            {messages.map((message) => (
              <li key={message.id} className={`chat-msg chat-msg--${message.role}`}>
                {message.text}
                {message.cells?.length > 0 && <span className="chat-msg__files">Notebook context: {message.cells.join(", ")}</span>}
                {message.files?.length > 0 && <span className="chat-msg__files">Attached: {message.files.join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="visually-hidden" role="status">
        <span key={announcement.seq}>{announcement.text}</span>
      </p>

      <ChatComposer
        attachments={attachments}
        cellContext={cellContext}
        cellDragActive={cellDragActive}
        dropOver={dropOver}
        connected={ASSISTANT_CONNECTED}
        onSend={handleSend}
        onAttachClick={onAttachClick}
        onRemoveAttachment={onRemoveAttachment}
        onRemoveCell={onRemoveCell}
      />
    </section>
  );
}
