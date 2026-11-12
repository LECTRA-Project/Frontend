import { ApiError } from "../client.js";
import { del, get, patch, post } from "../http.js";

/*
  LECTURE CHAT SERVICE — the Lecture Chat APIs (saved chat sessions).

    POST   /student_profile/chat/sessions                        createChatSession
    GET    /student_profile/chat/sessions                        listChatSessions / listAllChatSessions
    GET    /student_profile/chat/sessions/{id}                   getChatSession
    PATCH  /student_profile/chat/sessions/{id}                   renameChatSession
    DELETE /student_profile/chat/sessions/{id}                   deleteChatSession
    POST   /student_profile/chat/sessions/{id}/lectures          attachChatLecture
    DELETE /student_profile/chat/sessions/{id}/lectures/{lid}    detachChatLecture
    POST   /student_profile/chat/sessions/{id}/messages          sendChatMessage
    GET    /student_profile/chat/sessions/{id}/messages          listChatMessages / listAllChatMessages

  Every chat owns its materials: any number of lectures (none for a new chat), and the
  answers come from all of them. Its title is "New chat" until the first question, which
  the backend then turns into the title.

  Shapes (data of the { status, message, data } envelope):
    session  { id, title, lectures: [lecture], lecture: lectures[0] | null, created_at, updated_at }
             each lecture as GET /student_profile/lectures/{id} returns it.
    message  { id, session_id, role: "user" | "assistant", content, created_at,
               sources: [{ lecture_id, lecture_title, page_number,
                           source_type: "page" | "slide" | "cell", location: "Page 3" }] | null }
             An answer with no sources is general knowledge, not from the materials.
*/
const BASE = "/student_profile/chat/sessions";

// Questions longer than this are rejected by the backend (422).
export const MAX_MESSAGE_LENGTH = 2000;
/*
  How long to wait for an answer. The backend tries up to 5 LLM providers in turn
  (LLM_PROVIDERS), each with a 30 s timeout and one retry on invalid JSON — up to about
  5 minutes when the first providers are slow or failing. Giving up earlier shows
  "timed out" although the backend goes on and saves the answer.
*/
export const ANSWER_TIMEOUT_MS = 330000;
// Creating a session is a quick write, but a sleeping Render instance takes ~1 min to wake.
const CREATE_TIMEOUT_MS = 60000;
const MAX_PAGE_SIZE = 100;

function unwrap(response, action) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || `Unable to ${action}.`, data: response });
  }
  return response.data;
}

/* A new chat with the given lectures (none is fine: it then answers from general knowledge). */
export async function createChatSession({ lectureIds = [], title, signal } = {}) {
  const body = { lecture_ids: lectureIds };
  if (title) body.title = title;
  return unwrap(await post(BASE, body, { timeout: CREATE_TIMEOUT_MS, signal }), "start a chat");
}

/* Adds one of the student's lectures to a chat; returns the updated session. */
export async function attachChatLecture(id, lectureId) {
  return unwrap(await post(`${BASE}/${id}/lectures`, { lecture_id: lectureId }), "add the material to this chat");
}

/* Removes a lecture from a chat (the lecture itself is kept); returns the updated session. */
export async function detachChatLecture(id, lectureId) {
  return unwrap(await del(`${BASE}/${id}/lectures/${lectureId}`), "remove the material from this chat");
}

/* One page, most recently active first: { sessions, page, page_size, total, total_pages }. */
export async function listChatSessions({ page = 1, pageSize = 20, signal } = {}) {
  const response = await get(BASE, { params: { page, page_size: pageSize }, signal });
  return unwrap(response, "load your chats");
}

export async function listAllChatSessions({ signal } = {}) {
  const first = await listChatSessions({ page: 1, pageSize: MAX_PAGE_SIZE, signal });
  const sessions = [...first.sessions];
  for (let page = 2; page <= first.total_pages; page += 1) {
    sessions.push(...(await listChatSessions({ page, pageSize: MAX_PAGE_SIZE, signal })).sessions);
  }
  return sessions;
}

export async function getChatSession(id, { signal } = {}) {
  return unwrap(await get(`${BASE}/${id}`, { signal }), "load the chat");
}

export async function renameChatSession(id, title) {
  return unwrap(await patch(`${BASE}/${id}`, { title }), "rename the chat");
}

export async function deleteChatSession(id) {
  return unwrap(await del(`${BASE}/${id}`), "delete the chat");
}

/* Asks a question. Returns { question, answer, session } (both messages are saved). */
export async function sendChatMessage(id, content, { signal } = {}) {
  const response = await post(`${BASE}/${id}/messages`, { content }, { timeout: ANSWER_TIMEOUT_MS, signal });
  return unwrap(response, "get an answer");
}

/* One page, oldest first: { messages, page, page_size, total, total_pages }. */
export async function listChatMessages(id, { page = 1, pageSize = 50, signal } = {}) {
  const response = await get(`${BASE}/${id}/messages`, { params: { page, page_size: pageSize }, signal });
  return unwrap(response, "load the messages");
}

export async function listAllChatMessages(id, { signal } = {}) {
  const first = await listChatMessages(id, { page: 1, pageSize: MAX_PAGE_SIZE, signal });
  const messages = [...first.messages];
  for (let page = 2; page <= first.total_pages; page += 1) {
    messages.push(...(await listChatMessages(id, { page, pageSize: MAX_PAGE_SIZE, signal })).messages);
  }
  return messages;
}

/*
  Does this backend have the Lecture Chat API? One read-only request:
  200 → yes; 404/405 → no. A 401 (expired token) or network failure counts as unknown (false).
*/
export async function detectChat({ signal } = {}) {
  try {
    await listChatSessions({ page: 1, pageSize: 1, signal });
    return true;
  } catch (err) {
    if (err?.name === "CanceledError") throw err;
    return false;
  }
}
