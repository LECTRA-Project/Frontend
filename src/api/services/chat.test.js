import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import {
  attachChatLecture,
  createChatSession,
  detachChatLecture,
  deleteChatSession,
  detectChat,
  getChatSession,
  listAllChatMessages,
  listAllChatSessions,
  listChatSessions,
  renameChatSession,
  sendChatMessage,
} from "./chat.js";
import { mockApi, ok } from "../../test/helpers.jsx";

const BASE = "/student_profile/chat/sessions";
const session = (id, title = "New chat") => ({
  id,
  title,
  lecture: { id: "l-1", title: "Search", file_type: "application/pdf" },
  created_at: "2026-11-11T10:00:00Z",
  updated_at: "2026-11-11T10:00:00Z",
});

describe("lecture chat service", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    setAuthToken("test-token");
  });

  afterEach(() => {
    api.restore();
    setAuthToken(null);
  });

  it("creates a session with any number of lectures, sending the title only when given", async () => {
    const bodies = [];
    api.onPost(BASE).reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      bodies.push(JSON.parse(config.data));
      return [201, ok(session("s-1"))];
    });
    expect((await createChatSession()).id).toBe("s-1");
    await createChatSession({ lectureIds: ["l-1", "l-2"], title: "Revision" });
    expect(bodies).toEqual([{ lecture_ids: [] }, { lecture_ids: ["l-1", "l-2"], title: "Revision" }]);
  });

  it("attaches and detaches a chat's lectures, returning the updated session", async () => {
    api.onPost(`${BASE}/s-1/lectures`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ lecture_id: "l-2" });
      return [200, ok({ ...session("s-1"), lectures: [{ id: "l-2" }] })];
    });
    api.onDelete(`${BASE}/s-1/lectures/l-2`).reply(200, ok({ ...session("s-1"), lectures: [] }));
    expect((await attachChatLecture("s-1", "l-2")).lectures).toEqual([{ id: "l-2" }]);
    expect((await detachChatLecture("s-1", "l-2")).lectures).toEqual([]);
  });

  it("lists sessions with backend paging names and loads every page", async () => {
    api.onGet(BASE).reply((config) => {
      const { page, page_size: pageSize } = config.params;
      expect(pageSize).toBe(100);
      return [200, ok({ sessions: [session(`s-${page}`)], page, page_size: pageSize, total: 2, total_pages: 2 })];
    });
    expect((await listAllChatSessions()).map((item) => item.id)).toEqual(["s-1", "s-2"]);
  });

  it("gets, renames and deletes a session", async () => {
    api.onGet(`${BASE}/s-1`).reply(200, ok(session("s-1")));
    api.onPatch(`${BASE}/s-1`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ title: "Exam prep" });
      return [200, ok(session("s-1", "Exam prep"))];
    });
    api.onDelete(`${BASE}/s-1`).reply(200, ok({ id: "s-1" }));

    expect((await getChatSession("s-1")).id).toBe("s-1");
    expect((await renameChatSession("s-1", "Exam prep")).title).toBe("Exam prep");
    expect(await deleteChatSession("s-1")).toEqual({ id: "s-1" });
  });

  it("sends a message with a timeout longer than the backend's provider fallback and returns question, answer and session", async () => {
    api.onPost(`${BASE}/s-1/messages`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ content: "What is A*?" });
      expect(config.timeout).toBe(330000);
      return [
        201,
        ok({
          question: { id: "m-1", role: "user", content: "What is A*?", sources: null },
          answer: { id: "m-2", role: "assistant", content: "A best-first search.", sources: [{ lecture_id: "l-1", lecture_title: "Search", page_number: 3 }] },
          session: session("s-1", "What is A*?"),
        }),
      ];
    });
    const result = await sendChatMessage("s-1", "What is A*?");
    expect(result.answer.sources[0].page_number).toBe(3);
    expect(result.session.title).toBe("What is A*?");
  });

  it("loads every page of messages", async () => {
    api.onGet(`${BASE}/s-1/messages`).reply((config) => {
      const { page } = config.params;
      return [200, ok({ messages: [{ id: `m-${page}` }], page, page_size: 100, total: 2, total_pages: 2 })];
    });
    expect((await listAllChatMessages("s-1")).map((item) => item.id)).toEqual(["m-1", "m-2"]);
  });

  it("turns backend errors into ApiError with the server's message", async () => {
    api.onPost(`${BASE}/s-1/messages`).reply(503, { detail: "The AI assistant is currently unavailable. Please try again later" });
    const error = await sendChatMessage("s-1", "Hi").catch((err) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.message).toMatch(/currently unavailable/);
  });

  it("detects the chat API from one read-only request", async () => {
    api.onGet(BASE).replyOnce(200, ok({ sessions: [], page: 1, page_size: 1, total: 0, total_pages: 0 }));
    expect(await detectChat()).toBe(true);
    api.onGet(BASE).replyOnce(404, { detail: "Not Found" });
    expect(await detectChat()).toBe(false);
  });

  it("asks for one page of sessions with the given size", async () => {
    api.onGet(BASE).reply((config) => {
      expect(config.params).toEqual({ page: 3, page_size: 5 });
      return [200, ok({ sessions: [], page: 3, page_size: 5, total: 0, total_pages: 0 })];
    });
    await listChatSessions({ page: 3, pageSize: 5 });
  });
});
