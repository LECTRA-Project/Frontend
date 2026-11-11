import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import ChatComposer from "./ChatComposer.jsx";
import { sendStudyMessage } from "../../../services/studyAssistant.js";

/*
  Right panel: the Study Assistant, answering from the student's own lecture materials.

  Answers cite their sources as [S1], [S2]… Each citation is listed under the answer
  (lecture, page / slide / cell) and opens that place when clicked.

  Props:
    materials          the student's materials (toMaterial items); completed ones can be searched
    available          false when the backend has no AI assistant (null while unknown)
    onAttachClick      opens the upload dialog (+ button) — files are added to the materials
    onOpenReference    called with a reference { lecture_id, source_type, source_number, … }
*/
export default function StudyAssistantPanel({ materials = [], available = true, onAttachClick, onOpenReference }) {
  const unavailable = available === false;
  const [messages, setMessages] = useState([]);
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);

  const searchable = materials.filter((item) => item.status === "completed");
  const processing = materials.filter((item) => item.status === "processing").length;
  // Fall back to "all" when the scoped lecture was deleted or is reprocessing.
  const activeScope = scope !== "all" && searchable.some((item) => item.id === scope) ? scope : "all";

  async function handleSend(text) {
    const history = messages;
    setMessages((list) => [...list, { id: crypto.randomUUID(), role: "student", text }]);
    setBusy(true);
    try {
      const result = await sendStudyMessage({
        text,
        lectureIds: activeScope === "all" ? [] : [activeScope],
        history,
      });
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
    <section className="panel assistant" aria-labelledby="assistant-title">
      <div className="panel__header">
        <h2 id="assistant-title" className="panel__title">
          Study assistant
        </h2>
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

      <ChatComposer attachments={[]} onSend={handleSend} onAttachClick={onAttachClick} onRemoveAttachment={() => {}} disabled={busy || unavailable} />
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
