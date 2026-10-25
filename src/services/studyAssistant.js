/*
  STUDY ASSISTANT SERVICE — connection point for the LLM team.

  The Study Assistant panel calls `sendStudyMessage()` whenever the student sends a
  message. Right now nothing is connected, so it reports that instead of answering.

  To connect the assistant later:
    1. Replace the body of this function with a call to your backend / LLM endpoint.
    2. Set ASSISTANT_CONNECTED to true (the panel uses it for the status label).
    3. Return { connected: true, reply: "<assistant text>" }.

  Inputs:
    text         the student's message
    attachments  files the student picked with the + button (browser File objects)
*/
export const ASSISTANT_CONNECTED = false;

export async function sendStudyMessage({ text, attachments = [] }) {
  // Intentionally no AI call and no invented answer in this frontend phase.
  void text;
  void attachments;
  return { connected: false, reply: null };
}
