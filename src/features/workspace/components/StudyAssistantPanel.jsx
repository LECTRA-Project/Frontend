import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import ChatComposer from "./ChatComposer.jsx";
import { sendStudyMessage } from "../../../services/studyAssistant.js";
import {
  CELL_DROP_ZONE_ATTR,
  cellContextLabel,
  isCellDrag,
  readCellDrag,
  toAssistantContext,
} from "../../../services/notebook/cellContext.js";

/*
  Right panel: the Study Assistant, answering from the student's own lecture materials.

  Answers cite their sources as [S1], [S2]… Each citation is listed under the answer
  (lecture, page / slide / cell) and opens that place when clicked.

  Notebook cells can be dragged onto the whole panel (see NotebookCell's grip). They are
  listed in the composer as removable context and sent with the next message only when
  the student presses Send. Dropping a cell never runs or changes it.

  Props:
    materials          the student's materials (toMaterial items); completed ones can be searched
    available          false when the backend has no AI assistant (null while unknown)
    onAttachClick      opens the upload dialog (+ button) — files are added to the materials
    onOpenReference    called with a reference { lecture_id, source_type, source_number, … }
    cellContext        notebook cells added to the message (see services/notebook/cellContext.js)
    cellDragActive     a notebook cell is being dragged, so the composer shows its drop target
    cellDragOver       a touch/pen cell drag is over this panel (mouse drags are tracked here)
    announcement       { text, seq } screen-reader feedback about the draft
    onAddCell          adds a dropped cell to the draft
    onRemoveCell       removes one cell from the draft
    onSent             called with { cellIds } once a message has been answered
    handle             optional grip for moving the panel in the workspace (SectionHandle)
    materialContext    course materials added to the message (see materialContext.js); sent as
                       the lectures to answer from, instead of the "Search in" choice
    materialDrag       while a course material is dragged: { fileName, over, problem }
                       (the drop itself is handled by the workspace; this panel is its target)
    onRemoveMaterial   removes one material from the draft
*/
export default function StudyAssistantPanel({
  materials = [],
  available = true,
  onAttachClick,
  onOpenReference,
  cellContext = [],
  cellDragActive = false,
  cellDragOver = false,
  announcement = { text: "", seq: 0 },
  onAddCell = () => {},
  onRemoveCell = () => {},
  onSent = () => {},
  handle = null,
  materialContext = [],
  materialDrag = null,
  onRemoveMaterial = () => {},
}) {
  const unavailable = available === false;
  const [messages, setMessages] = useState([]);
  const [nativeDragOver, setNativeDragOver] = useState(false);
  const dropOver = nativeDragOver || cellDragOver || Boolean(materialDrag?.over);
  const dropInvalid = Boolean(materialDrag?.problem);
  const dropHint = materialDrag
    ? (materialDrag.problem ?? `Drop to add “${materialDrag.fileName}” to your question`)
    : "Drop to add this cell to your question";

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
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);

  const searchable = materials.filter((item) => item.status === "completed");
  const processing = materials.filter((item) => item.status === "processing").length;
  // Fall back to "all" when the scoped lecture was deleted or is reprocessing.
  const activeScope = scope !== "all" && searchable.some((item) => item.id === scope) ? scope : "all";

  async function handleSend(text) {
    const history = messages;
    const cells = cellContext;
    const attached = materialContext;
    setMessages((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        role: "student",
        text,
        cells: cells.map(cellContextLabel),
        materials: attached.map((item) => item.fileName),
      },
    ]);
    setBusy(true);
    try {
      const result = await sendStudyMessage({
        text,
        // Added materials are the lectures to answer from; otherwise the "Search in" choice.
        lectureIds: attached.length ? attached.map((item) => item.lectureId) : activeScope === "all" ? [] : [activeScope],
        history,
        notebookCells: cells.map(toAssistantContext),
      });
      // Clear the sent context only once the message went through; on failure it stays in the draft.
      onSent({ cellIds: cells.map((cell) => cell.id), materialIds: attached.map((item) => item.id) });
      setMessages((list) => [
        ...list,
        { id: crypto.randomUUID(), role: "assistant", text: result.reply, found: result.found, references: result.references },
      ]);
    } catch (err) {
      setMessages((list) => [
        ...list,
        { id: crypto.randomUUID(), role: "system", text: err.message || "The assistant could not answer right now." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`panel assistant ${dropOver ? "assistant--drop-over" : ""} ${dropOver && dropInvalid ? "assistant--drop-invalid" : ""}`}
      aria-labelledby="assistant-title"
      {...{ [CELL_DROP_ZONE_ATTR]: "" }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="panel__header">
        <div className="panel__heading">
          {handle}
          <h2 id="assistant-title" className="panel__title">
            Study assistant
          </h2>
        </div>
        <span className="pill" title={unavailable ? "The server has no AI assistant yet" : "Materials the assistant can search"}>
          <span className={`pill__dot ${searchable.length && !unavailable ? "pill__dot--on" : ""}`} />
          {unavailable ? "Not available" : searchable.length === 1 ? "1 material" : `${searchable.length} materials`}
        </span>
      </div>

      <div className="assistant__scope" hidden={unavailable}>
        <label htmlFor="assistant-scope">Search in</label>
        <select id="assistant-scope" value={activeScope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">All my materials</option>
          {searchable.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="assistant__body" aria-live="polite">
        {messages.length === 0 ? (
          <div className="assistant__empty">
            <span className="assistant__empty-icon">
              <Icon name="message" />
            </span>
            <p className="assistant__empty-title">{unavailable ? "Assistant not available yet" : "Ask about your materials"}</p>
            <p className="assistant__empty-text">
              {unavailable
                ? "The connected server doesn’t run the AI assistant yet. Your materials are still saved and can be opened."
                : searchable.length
                ? "Answers come only from your uploaded lectures, with the page, slide or cell they’re based on."
                : processing
                  ? "Your materials are still being processed. You can ask as soon as one shows Completed."
                  : "Upload PDFs, slides or notebooks, then ask questions about them here."}
            </p>
          </div>
        ) : (
          <ul className="assistant__messages">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`chat-msg chat-msg--${message.role} ${message.found === false ? "chat-msg--not-found" : ""}`}
              >
                <AnswerText text={message.text} references={message.references} onOpen={onOpenReference} />
                {message.cells?.length > 0 && <span className="chat-msg__files">Notebook context: {message.cells.join(", ")}</span>}
                {message.materials?.length > 0 && <span className="chat-msg__files">Materials: {message.materials.join(", ")}</span>}
                {message.references?.length > 0 && (
                  <ol className="chat-sources" aria-label="Sources">
                    {message.references.map((ref) => (
                      <li key={ref.id}>
                        <button type="button" className="chat-source" onClick={() => onOpenReference?.(ref)} title={ref.snippet}>
                          <span className="chat-source__id">{ref.id}</span>
                          <span className="chat-source__text">
                            {ref.lecture_title} — {ref.location}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
            {busy && (
              <li className="chat-msg chat-msg--system" role="status">
                Searching your materials…
              </li>
            )}
          </ul>
        )}
      </div>

      <p className="visually-hidden" role="status">
        <span key={announcement.seq}>{announcement.text}</span>
      </p>

      <ChatComposer
        attachments={[]}
        cellContext={cellContext}
        cellDragActive={cellDragActive || Boolean(materialDrag)}
        dropOver={dropOver}
        dropHint={dropHint}
        dropInvalid={dropInvalid}
        materials={materialContext}
        onRemoveMaterial={onRemoveMaterial}
        connected={!unavailable}
        onSend={handleSend}
        onAttachClick={onAttachClick}
        onRemoveAttachment={() => {}}
        onRemoveCell={onRemoveCell}
        disabled={busy || unavailable}
      />
    </section>
  );
}

/* Answer text with [S1]-style markers turned into buttons that open the source. */
function AnswerText({ text, references, onOpen }) {
  if (!references?.length) return <span className="chat-msg__text">{text}</span>;
  const byId = Object.fromEntries(references.map((ref) => [ref.id, ref]));
  const parts = text.split(/(\[S\d+\])/g);
  return (
    <span className="chat-msg__text">
      {parts.map((part, index) => {
        const ref = byId[part.slice(1, -1)];
        if (!ref) return part;
        return (
          <button
            key={index}
            type="button"
            className="chat-cite"
            aria-label={`Source ${ref.id}: ${ref.lecture_title}, ${ref.location}`}
            onClick={() => onOpen?.(ref)}
          >
            {ref.id}
          </button>
        );
      })}
    </span>
  );
}
