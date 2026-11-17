import { ok, TEST_USER } from "./helpers.jsx";

/*
  A small in-memory backend for the chat-first workspace tests: lectures (with the AI
  processing fields), chat sessions that own any number of lectures, and their messages.
  Install it on a MockAdapter; the returned state can be changed and inspected by a test.

  Answers: a question containing "1+1" (or asked in a chat without lectures) gets a general
  answer with no sources; any other question cites page / slide / cell 2 of each lecture and
  ends with a suggestion of the next step (as the backend's lecture answers do).
  Projects: a chat in a project (projectId) answers from the project's lectures, and adding or
  removing a lecture in such a chat changes the project; a question moves the project's last
  activity. Deleting a project deletes its chats.
*/
export const SUGGESTION = "Shall I explain the next section, Pruning (page 3)?";
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

export function installChatBackend(api, { lectures = [], sessions = [], messages = {}, projects = [], chat = true, models, progressCompletion = true } = {}) {
  const state = {
    // The progress answers carry the lecture's completion_percent (false: an older backend).
    progressCompletion,
    models: models ?? { default: "lectra", models: [{ id: "lectra", provider: "lectra", model: null, name: "Lectra" }], unavailable: [] },
    lectures: [...lectures],
    // { id, title, lectureIds, projectId, created_at, updated_at }
    sessions: sessions.map((item) => ({ lectureIds: [], projectId: null, created_at: item.updated_at, ...item })),
    // { id, name, lectureIds, created_at, updated_at }
    projects: projects.map((item) => ({ lectureIds: [], created_at: item.updated_at, ...item })),
    // Bodies of PUT …/project (moving a chat into a project).
    moved: [],
    messages: { ...messages },
    sent: [],
    viewed: {}, // lecture id → Set of pages read
    requests: [], // { key: "sessions" | "messages", page, size } for each list request
    // A promise the list of chats waits for (to act before the chats are loaded).
    sessionsGate: null,
    nextId: 1,
  };
  const lecture = (id) => state.lectures.find((item) => item.id === id);
  const projectOf = (session) => (session.projectId ? state.projects.find((item) => item.id === session.projectId) : null);
  // The lectures a chat answers from: its project's for a chat in a project.
  const lectureIdsOf = (session) => projectOf(session)?.lectureIds ?? session.lectureIds;
  const payload = (session) => {
    const owned = lectureIdsOf(session).map(lecture).filter(Boolean);
    const project = projectOf(session);
    return {
      id: session.id,
      title: session.title,
      lecture: owned[0] ?? null,
      lectures: owned,
      project: project ? { id: project.id, name: project.name } : null,
      created_at: session.created_at,
      updated_at: session.updated_at,
    };
  };
  const projectPayload = (project, { detail = true } = {}) => {
    const owned = project.lectureIds.map(lecture).filter(Boolean);
    return {
      id: project.id,
      name: project.name,
      chat_count: state.sessions.filter((item) => item.projectId === project.id).length,
      material_count: owned.length,
      created_at: project.created_at,
      updated_at: project.updated_at,
      ...(detail ? { lectures: owned } : {}),
    };
  };
  const byActivity = (a, b) => b.updated_at.localeCompare(a.updated_at);
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
  // Reading progress: a lecture's pages are 1..source_count (an image: page 1).
  const progress = (found) => {
    const total = found.source_type ? found.source_count : 1;
    const viewed = [...(state.viewed[found.id] ?? [])].filter((page) => page <= total).sort((a, b) => a - b);
    return { viewed_pages: viewed, viewed: viewed.length, total, percent: total ? Math.round((100 * viewed.length) / total) : 0 };
  };
  // The answer of GET / POST …/progress: the progress, with the lecture's completion.
  const progressAnswer = (found) => {
    const current = lecture(found.id) ?? found;
    const withCompletion = state.progressCompletion && typeof current.completion_percent === "number";
    return withCompletion ? { ...progress(current), completion_percent: current.completion_percent } : progress(current);
  };
  api.onGet(/\/student_profile\/lectures\/[^/]+\/progress$/).reply((config) => {
    const found = lecture(config.url.split("/")[3]);
    return found ? [200, ok(progressAnswer(found))] : [404, { detail: "Lecture not found" }];
  });
  api.onPost(/\/student_profile\/lectures\/[^/]+\/progress$/).reply((config) => {
    const found = lecture(config.url.split("/")[3]);
    if (!found) return [404, { detail: "Lecture not found" }];
    const { pages } = JSON.parse(config.data);
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > 200) return [422, { detail: "Invalid pages" }];
    state.viewed[found.id] = new Set([...(state.viewed[found.id] ?? []), ...pages]);
    // A lecture with a completion keeps it current (reading only, 70% of it, no exam).
    if (typeof found.completion_percent === "number") {
      const read = progress(found);
      const updated = { ...found, completion_percent: Math.round((70 * read.viewed) / read.total) };
      state.lectures = state.lectures.map((item) => (item.id === found.id ? updated : item));
    }
    return [200, ok(progressAnswer(found), "Reading progress saved")];
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
    for (const project of state.projects) project.lectureIds = project.lectureIds.filter((item) => item !== id);
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
    const list = [...state.sessions].sort(byActivity).map(payload);
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
    const owner = projectOf(session) ?? session; // in a project: the project's lectures
    if (!owner.lectureIds.includes(id)) owner.lectureIds.push(id);
    return [200, ok(payload(session))];
  });
  api.onDelete(/\/chat\/sessions\/[^/]+\/lectures\/[^/]+$/).reply((config) => {
    const session = find(config);
    const id = config.url.split("/").at(-1);
    const owner = projectOf(session) ?? session;
    owner.lectureIds = owner.lectureIds.filter((item) => item !== id);
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
    const { content, model, exam_id, task_id } = JSON.parse(config.data);
    const entry = model === undefined ? { id: session.id, content } : { id: session.id, content, model };
    // A question about an exam answer (#124) carries both ids, like the backend expects.
    if (exam_id !== undefined || task_id !== undefined) Object.assign(entry, { exam_id, task_id });
    state.sent.push(entry);
    const general = content.includes("1+1") || lectureIdsOf(session).length === 0;
    const sources = general
      ? []
      : lectureIdsOf(session).map(lecture).map((item) => ({
          lecture_id: item.id,
          lecture_title: item.title,
          page_number: 2,
          source_type: item.source_type ?? "page",
          location: `${UNIT[item.source_type ?? "page"]} 2`,
        }));
    const now = new Date().toISOString();
    const question = {
      id: newId("m"),
      session_id: session.id,
      role: "user",
      content,
      sources: null,
      exam_id: exam_id ?? null,
      task_id: task_id ?? null,
      created_at: now,
    };
    const answer = {
      id: newId("m"),
      session_id: session.id,
      role: "assistant",
      content: general ? "This is not covered in your lecture materials, but in general: 1 + 1 equals 2." : "Hunt's algorithm grows a tree **top-down**.",
      sources,
      suggestion: general ? null : SUGGESTION,
      created_at: now,
    };
    if (session.title === "New chat") session.title = content.slice(0, 60);
    session.updated_at = now;
    if (projectOf(session)) projectOf(session).updated_at = now;
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

  // ── Chats moving in and out of projects ──
  api.onPut(/\/chat\/sessions\/[^/]+\/project$/).reply((config) => {
    const session = find(config);
    const body = JSON.parse(config.data);
    const project = state.projects.find((item) => item.id === body.project_id);
    if (!session) return [404, { status: false, message: "Chat session not found", data: null }];
    if (!project) return [404, { status: false, message: "Project not found", data: null }];
    state.moved.push({ id: session.id, body });
    if (session.projectId !== project.id) {
      if (body.add_materials !== false) {
        for (const id of lectureIdsOf(session)) if (!project.lectureIds.includes(id)) project.lectureIds.push(id);
      }
      session.lectureIds = [];
      session.projectId = project.id;
      if (session.updated_at > project.updated_at) project.updated_at = session.updated_at;
    }
    return [200, ok(payload(session))];
  });
  api.onDelete(/\/chat\/sessions\/[^/]+\/project$/).reply((config) => {
    const session = find(config);
    if (session.projectId) {
      session.lectureIds = [...lectureIdsOf(session)];
      session.projectId = null;
    }
    return [200, ok(payload(session))];
  });

  // ── Projects ──
  const PROJECTS = "/student_profile/projects";
  const findProject = (config) => state.projects.find((item) => item.id === config.url.split("/")[3]);
  const noProject = [404, { status: false, message: "Project not found", data: null }];
  const validName = (config) => {
    const { name } = JSON.parse(config.data);
    const trimmed = typeof name === "string" ? name.trim() : "";
    return trimmed && trimmed.length <= 255 ? trimmed : null;
  };
  const invalidName = [422, { status: false, message: "Name is required", data: { errors: { name: "Name is required" } } }];
  api.onGet(PROJECTS).reply((config) => {
    const list = [...state.projects].sort(byActivity).map((item) => projectPayload(item, { detail: false }));
    return [200, ok(pageOf(list, { params: { page_size: 30, ...config.params } }, "projects"))];
  });
  api.onPost(PROJECTS).reply((config) => {
    const name = validName(config);
    if (!name) return invalidName;
    const now = new Date().toISOString();
    const project = { id: newId("p-new"), name, lectureIds: [], created_at: now, updated_at: now };
    state.projects.push(project);
    return [201, ok(projectPayload(project))];
  });
  api.onGet(/\/student_profile\/projects\/[^/]+$/).reply((config) => {
    const project = findProject(config);
    return project ? [200, ok(projectPayload(project))] : noProject;
  });
  api.onPatch(/\/student_profile\/projects\/[^/]+$/).reply((config) => {
    const project = findProject(config);
    if (!project) return noProject;
    const name = validName(config);
    if (!name) return invalidName;
    project.name = name;
    return [200, ok(projectPayload(project))];
  });
  api.onDelete(/\/student_profile\/projects\/[^/]+$/).reply((config) => {
    const project = findProject(config);
    if (!project) return noProject;
    const chats = state.sessions.filter((item) => item.projectId === project.id);
    state.sessions = state.sessions.filter((item) => item.projectId !== project.id);
    state.projects = state.projects.filter((item) => item !== project);
    return [200, ok({ id: project.id, deleted_chats: chats.length })];
  });
  api.onPost(/\/student_profile\/projects\/[^/]+\/lectures$/).reply((config) => {
    const project = findProject(config);
    const { lecture_id: id } = JSON.parse(config.data);
    if (!project || !lecture(id)) return [404, { detail: "Not found" }];
    if (!project.lectureIds.includes(id)) project.lectureIds.push(id);
    return [200, ok(projectPayload(project))];
  });
  api.onDelete(/\/student_profile\/projects\/[^/]+\/lectures\/[^/]+$/).reply((config) => {
    const project = findProject(config);
    const id = config.url.split("/").at(-1);
    project.lectureIds = project.lectureIds.filter((item) => item !== id);
    return [200, ok(projectPayload(project))];
  });
  api.onGet(/\/student_profile\/projects\/[^/]+\/sessions$/).reply((config) => {
    const project = findProject(config);
    if (!project) return noProject;
    const list = state.sessions.filter((item) => item.projectId === project.id).sort(byActivity).map(payload);
    return [200, ok(pageOf(list, config, "sessions"))];
  });
  api.onPost(/\/student_profile\/projects\/[^/]+\/sessions$/).reply((config) => {
    const project = findProject(config);
    if (!project) return noProject;
    const body = JSON.parse(config.data ?? "{}");
    const now = new Date().toISOString();
    const session = { id: newId("s-proj"), title: body.title ?? "New chat", lectureIds: [], projectId: project.id, created_at: now, updated_at: now };
    state.sessions.push(session);
    state.messages[session.id] = [];
    return [201, ok(payload(session))];
  });
  return state;
}
