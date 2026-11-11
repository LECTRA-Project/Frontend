/*
  STUDY ASSISTANT SERVICE — asks the backend's RAG assistant about the student's
  own lecture materials (POST /student_profile/assistant/ask).

  The backend searches only this student's processed lectures, answers only from
  them, and returns the sources it used. When the materials don't contain the
  answer, `found` is false and there are no references.

  Inputs:
    text        the student's question
    lectureIds  optional: search only these lectures (empty = all)
    history     earlier messages [{ role: "student" | "assistant", text }] for follow-ups
  Returns { connected: true, reply, found, references }.
*/
import { askAssistant } from "../api/services/lectures.js";

export const ASSISTANT_CONNECTED = true;
const HISTORY_TURNS = 6;

export async function sendStudyMessage({ text, lectureIds = [], history = [], signal }) {
  const turns = history
    .filter((message) => message.role === "student" || message.role === "assistant")
    .slice(-HISTORY_TURNS)
    .map((message) => ({ role: message.role === "student" ? "user" : "assistant", content: message.text.slice(0, 4000) }));

  const data = await askAssistant({ question: text, lectureIds, history: turns, signal });
  return { connected: true, reply: data.answer, found: data.found, references: data.references ?? [] };
}
