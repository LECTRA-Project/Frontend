import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import ChatComposer from "./ChatComposer.jsx";
import LectureChat from "./LectureChat.jsx";
import { CELL_DROP_ZONE_ATTR, isCellDrag, readCellDrag } from "../../../services/notebook/cellContext.js";

/*
  Right panel: the Study Assistant, answering from the student's own lecture materials.

  Notebook cells can be dragged onto the whole panel (see NotebookCell's grip). They are
  listed in the composer as removable context and sent with the next message only when
  the student presses Send. Dropping a cell never runs or changes it.

  Questions go through the backend's Lecture Chat API (saved chats, one lecture each — see
  LectureChat). Until the workspace knows the server has it, and when it doesn't, the panel
  says so and the composer is disabled: nothing is sent anywhere else.

  Props:
    chat               true when the server has the Lecture Chat API (saved chat sessions)
    focusLectureId     the lecture open in the viewer; what chat questions are about
    onOpenLecture(id)  opens a lecture in the viewer (when a saved chat about it is opened)
    materials          the student's materials (toMaterial items)
    available          false when the backend has no chat API (null while unknown)
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
    materialContext    course materials added to the message (see materialContext.js); a dropped
                       material becomes the lecture the chat is about
    materialDrag       while a course material is dragged: { fileName, over, problem }
                       (the drop itself is handled by the workspace; this panel is its target)
    onRemoveMaterial   removes one material from the draft
*/
export default function StudyAssistantPanel({
  chat = false,
  focusLectureId = null,
  onOpenLecture,
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
  const checking = available === null;
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
  // A lecture without a processing status (the backend has no processing) is usable too.
  const searchable = materials.filter((item) => item.status === "completed" || item.status == null);

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
          {unavailable ? "Not available" : checking ? "Connecting…" : searchable.length === 1 ? "1 material" : `${searchable.length} materials`}
        </span>
      </div>

      {chat ? (
        <LectureChat
          materials={materials}
          focusLectureId={focusLectureId}
          onOpenLecture={onOpenLecture}
          onOpenReference={onOpenReference}
          cellContext={cellContext}
          materialContext={materialContext}
          onSent={onSent}
          composerProps={{
            attachments: [],
            cellContext,
            cellDragActive: cellDragActive || Boolean(materialDrag),
            dropOver,
            dropHint,
            dropInvalid,
            materials: materialContext,
            onRemoveMaterial,
            onAttachClick,
            onRemoveAttachment: () => {},
            onRemoveCell,
          }}
        />
      ) : (
        <>
          <div className="assistant__body" aria-live="polite">
            <div className="assistant__empty">
              <span className="assistant__empty-icon">
                <Icon name="message" />
              </span>
              <p className="assistant__empty-title">{checking ? "Connecting to the study assistant…" : "Assistant not available yet"}</p>
              <p className="assistant__empty-text">
                {checking
                  ? "Checking whether this server runs the study assistant."
                  : "The connected server doesn’t run the study assistant yet. Your materials are still saved and can be opened."}
              </p>
            </div>
          </div>

          <ChatComposer
            attachments={[]}
            cellContext={cellContext}
            cellDragActive={cellDragActive || Boolean(materialDrag)}
            dropOver={dropOver}
            dropHint={dropHint}
            dropInvalid={dropInvalid}
            materials={materialContext}
            onRemoveMaterial={onRemoveMaterial}
            connected={false}
            onSend={() => {}}
            onAttachClick={onAttachClick}
            onRemoveAttachment={() => {}}
            onRemoveCell={onRemoveCell}
            disabled
          />
        </>
      )}

      <p className="visually-hidden" role="status">
        <span key={announcement.seq}>{announcement.text}</span>
      </p>
    </section>
  );
}
