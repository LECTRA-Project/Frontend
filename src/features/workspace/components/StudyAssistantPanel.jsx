import { useState } from "react";

import Icon from "../../../components/ui/Icon.jsx";
import ChatComposer from "./ChatComposer.jsx";
import { ASSISTANT_CONNECTED, sendStudyMessage } from "../../../services/studyAssistant.js";

/*
  Right panel: the Study Assistant.
  The assistant is NOT connected in this phase. Sending a message shows the student's
  own message and a note that it was not answered — no AI reply is generated.

  The LLM team connects the assistant in src/services/studyAssistant.js; this panel
  already shows `reply` when the service returns one.

  Props:
    attachments         files picked with the + button (from the shared upload dialog)
    onAttachClick       opens the shared upload dialog
    onClearAttachments  empties the attachment list after sending
    onRemoveAttachment  removes one attachment
*/
export default function StudyAssistantPanel({ attachments, onAttachClick, onClearAttachments, onRemoveAttachment }) {
  const [messages, setMessages] = useState([]);

  async function handleSend(text) {
    const files = attachments;
    setMessages((list) => [...list, { id: crypto.randomUUID(), role: "student", text, files: files.map((f) => f.name) }]);
    onClearAttachments();

    const result = await sendStudyMessage({ text, attachments: files });

    const nextMessage = result.connected
      ? { id: crypto.randomUUID(), role: "assistant", text: result.reply }
      : { id: crypto.randomUUID(), role: "system", text: "The study assistant isn’t connected yet, so this message wasn’t answered." };
    setMessages((list) => [...list, nextMessage]);
  }

  return (
    <section className="panel assistant" aria-labelledby="assistant-title">
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
                {message.files?.length > 0 && <span className="chat-msg__files">Attached: {message.files.join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ChatComposer
        attachments={attachments}
        onSend={handleSend}
        onAttachClick={onAttachClick}
        onRemoveAttachment={onRemoveAttachment}
      />
    </section>
  );
}
