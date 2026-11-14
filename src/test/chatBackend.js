import { ok, TEST_USER } from "./helpers.jsx";

/*
  A small in-memory backend for the chat-first workspace tests: lectures (with the AI
  processing fields), chat sessions that own any number of lectures, and their messages.
  Install it on a MockAdapter; the returned state can be changed and inspected by a test.

  Answers: a question containing "1+1" (or asked in a chat without lectures) gets a general
  answer with no sources; any other question cites page / slide / cell 2 of each lecture.
*/
const SESSIONS = "/student_profile/chat/sessions";
const SOURCE_TYPE = { "application/pdf": "page", "application/x-ipynb+json": "cell" };
const UNIT = { page: "Page", slide: "Slide", cell: "Cell" };

export function lectureFixture(id, title, { fileType = "application/pdf", fileName, count = 5, status = "completed", uploadedAt = "2026-11-01T10:00:00Z" } = {}) {
  const sourceType = SOURCE_TYPE[fileType] ?? (fileType.includes("presentation") ? "slide" : null);
  return {
    id,
    user_id: TEST_USER.id,
    title,
    original_filename: fileName ?? `${title}.${sourceType === "cell" ? "ipynb" : sourceType === "slide" ? "pptx" : "pdf"}`,
    file_type: fileType,
    file_size: 4096,
    s3_url: `local://lectures/${id}`,
    uploaded_at: uploadedAt,
    updated_at: uploadedAt,
    processing_status: status,
    processing_error: status === "failed" ? "The text could not be read from this file." : null,
    source_type: sourceType,
    source_count: count,
    content_version: uploadedAt,
  };
}

export function daysAgo(days, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function installChatBackend(api, { lectures = [], sessions = [], messages = {}, chat = true, models } = {}) {
  const state = {
    models: models ?? { default: "lectra", models: [{ id: "lectra", provider: "lectra", model: null, name: "Lectra" }], unavailable: [] },
    lectures: [...lectures],
    // { id, title, lectureIds, created_at, updated_at }
    sessions: sessions.map((item) => ({ lectureIds: [], created_at: item.updated_at, ...item })),
    messages: { ...messages },
    sent: [],
    requests: [], // { key: "sessions" | "messages", page, size } for each list request
    // A promise the list of chats waits for (to act before the chats are loaded).
    sessionsGate: null,
    nextId: 1,
  };
  const lecture = (id) => state.lectures.find((item) => item.id === id);
  const payload = (session) => {
    const owned = session.lectureIds.map(lecture).filter(Boolean);
    return {
      id: session.id,
      title: session.title,
      lecture: owned[0] ?? null,
      lectures: owned,
      created_at: session.created_at,
      updated_at: session.updated_at,
    };
  };
  const find = (config) => state.sessions.find((item) => item.id === config.url.split("/")[4]);
  const newId = (prefix) => `${prefix}-${state.nextId++}`;

  api.onGet("/users/me").reply(200, ok(TEST_USER));
  // The models beside the chat input: Lectra only (no own API keys) unless a test says otherwise.
  api.onGet("/users/me/models").reply(() => [200, ok(state.models)]);
  api.onGet("/student_profile/lectures").reply(() => [
    200,
    ok({ lectures: state.lectures, page: 1, page_size: 100, total: state.lectures.length, total_pages: 1 }),
  ]);
  api.onGet(/\/student_profile\/lectures\/[^/]+\/file$/).reply(200, new Blob(["%PDF-1.4"], { type: "application/pdf" }));
  api.onGet(/\/student_profile\/lectures\/[^/]+\/content$/).reply((config) => {
    const found = lecture(config.url.split("/")[3]);
    if (!found) return [404, { detail: "Lecture not found" }];
    const type = found.source_type ?? "page";
    const sections = Array.from({ length: found.source_count }, (_, index) => ({
      source_number: index + 1,
      source_type: type,
      source_label: type === "cell" && index % 2 ? "code" : null,
      location: `${UNIT[type]} ${index + 1}`,
      text: `${UNIT[type]} ${index + 1} of ${found.title}`,
    }));
    return [200, ok({ sections, page: 1, page_size: 1000, total: sections.length, total_pages: 1 })];
  });
  api.onGet(/\/student_profile\/lectures\/[^/]+$/).reply((config) => {
    const found = lecture(config.url.split("/").at(-1));
    return found ? [200, ok(found)] : [404, { detail: "Lecture not found" }];
  });
  api.onPost("/student_profile/upload-lecture").reply((config) => {
    const file = config.data.get("file");
    const type = file.name.endsWith(".ipynb") ? "application/x-ipynb+json" : "application/pdf";
    const created = lectureFixture(newId("l-up"), config.data.get("title"), { fileType: type, fileName: file.name, uploadedAt: new Date().toISOString() });
    state.lectures = [created, ...state.lectures];
    return [201, ok(created)];
  });
  // Like the backend: only { title } (1–255 characters) is accepted; anything else is a 422.
  api.onPatch(/\/student_profile\/lectures\/[^/]+$/).reply((config) => {
    const id = config.url.split("/").at(-1);
    const body = JSON.parse(config.data);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (Object.keys(body).join() !== "title" || !title || title.length > 255) {
      return [422, { status: false, message: "Validation error", data: { errors: [{ loc: ["body", "title"], msg: "Invalid title" }] } }];
    }
    if (!lecture(id)) return [404, { detail: "Lecture not found" }];
    state.lectures = state.lectures.map((item) => (item.id === id ? { ...item, title, updated_at: new Date().toISOString() } : item));
    return [200, ok(lecture(id))];
  });
  // Deleting a lecture also takes it out of every chat (the link rows cascade).
  api.onDelete(/\/student_profile\/lectures\/[^/]+$/).reply((config) => {
    const id = config.url.split("/").at(-1);
    if (!lecture(id)) return [404, { detail: "Lecture not found" }];
    state.lectures = state.lectures.filter((item) => item.id !== id);
    for (const session of state.sessions) session.lectureIds = session.lectureIds.filter((item) => item !== id);
    return [200, ok({ id })];
  });
  api.onPost(/\/student_profile\/lectures\/[^/]+\/reprocess$/).reply((config) => {
    const id = config.url.split("/")[3];
    state.lectures = state.lectures.map((item) => (item.id === id ? { ...item, processing_status: "completed", processing_error: null } : item));
    return [200, ok(lecture(id))];
  });

  if (!chat) {
    api.onGet(SESSIONS).reply(404, { detail: "Not Found" });
    return state;
  }

  // Paged like the backend: ?page (from 1) and ?page_size; total_pages is 0 for an empty list.
  const pageOf = (items, config, key) => {
    const page = Number(config.params?.page ?? 1);
    const size = Number(config.params?.page_size ?? 20);
    state.requests.push({ key, page, size });
    return { [key]: items.slice((page - 1) * size, page * size), page, page_size: size, total: items.length, total_pages: Math.ceil(items.length / size) };
  };
  api.onGet(SESSIONS).reply(async (config) => {
    // (Not the one-item check whether the server has chats.)
    if (state.sessionsGate && config.params?.page_size !== 1) await state.sessionsGate;
    const list = [...state.sessions].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(payload);
    return [200, ok(pageOf(list, config, "sessions"))];
  });
  api.onPost(SESSIONS).reply((config) => {
    const body = JSON.parse(config.data);
    const now = new Date().toISOString();
    const session = { id: newId("s-new"), title: body.title ?? "New chat", lectureIds: body.lecture_ids ?? [], created_at: now, updated_at: now };
    state.sessions.push(session);
    state.messages[session.id] = [];
    return [201, ok(payload(session))];
  });
  api.onPost(/\/chat\/sessions\/[^/]+\/lectures$/).reply((config) => {
    const session = find(config);
    const { lecture_id: id } = JSON.parse(config.data);
    if (!session || !lecture(id)) return [404, { detail: "Not found" }];
    if (!session.lectureIds.includes(id)) session.lectureIds.push(id);
    return [200, ok(payload(session))];
  });
  api.onDelete(/\/chat\/sessions\/[^/]+\/lectures\/[^/]+$/).reply((config) => {
    const session = find(config);
    const id = config.url.split("/").at(-1);
    session.lectureIds = session.lectureIds.filter((item) => item !== id);
    return [200, ok(payload(session))];
  });
  api.onGet(/\/chat\/sessions\/[^/]+$/).reply((config) => {
    const session = find(config);
    return session ? [200, ok(payload(session))] : [404, { status: false, message: "Chat session not found", data: null }];
  });
  api.onGet(/\/chat\/sessions\/[^/]+\/messages$/).reply((config) => {
    const list = state.messages[find(config)?.id] ?? [];
    return [200, ok(pageOf(list, config, "messages"))];
  });
  api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply((config) => {
    const session = find(config);
    const { content, model } = JSON.parse(config.data);
    state.sent.push(model === undefined ? { id: session.id, content } : { id: session.id, content, model });
    const general = content.includes("1+1") || session.lectureIds.length === 0;
    const sources = general
      ? []
      : session.lectureIds.map(lecture).map((item) => ({
          lecture_id: item.id,
          lecture_title: item.title,
          page_number: 2,
          source_type: item.source_type ?? "page",
          location: `${UNIT[item.source_type ?? "page"]} 2`,
        }));
    const now = new Date().toISOString();
    const question = { id: newId("m"), session_id: session.id, role: "user", content, sources: null, created_at: now };
    const answer = {
      id: newId("m"),
      session_id: session.id,
      role: "assistant",
      content: general ? "This is not covered in your lecture materials, but in general: 1 + 1 equals 2." : "Hunt's algorithm grows a tree **top-down**.",
      sources,
      created_at: now,
    };
    if (session.title === "New chat") session.title = content.slice(0, 60);
    session.updated_at = now;
    state.messages[session.id] = [...(state.messages[session.id] ?? []), question, answer];
    return [201, ok({ question, answer, session: payload(session) })];
  });
  api.onPatch(/\/chat\/sessions\/[^/]+$/).reply((config) => {
    const session = find(config);
    session.title = JSON.parse(config.data).title;
    return [200, ok(payload(session))];
  });
  api.onDelete(/\/chat\/sessions\/[^/]+$/).reply((config) => {
    const session = find(config);
    state.sessions = state.sessions.filter((item) => item !== session);
    return [200, ok({ id: session.id })];
  });
  return state;
}
