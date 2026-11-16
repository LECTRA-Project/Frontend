import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import { getCompletion, getOverview } from "./statistics.js";
import { mockApi, ok } from "../../test/helpers.jsx";

const COMPLETION = {
  lectures: [
    { lecture_id: "a", title: "KI 02", source_type: "page", viewed: 33, total: 65, reading_percent: 51, best_exam_percent: 50, completion_percent: 51 },
  ],
  overall_percent: 51,
  weights: { reading: 70, exam: 30 },
};

const OVERVIEW = {
  lectures: 3,
  pages_read: 214,
  pages_total: 340,
  chats: 14,
  questions_asked: 87,
  exams_taken: 12,
  questions_answered: 58,
  average_score_percent: 68,
  correct_percent: 61,
  study_days: 9,
  current_streak: 5,
  last_activity_at: "2026-11-16T09:03:37+00:00",
};

describe("statistics service", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    setAuthToken("test-token");
  });

  afterEach(() => {
    api.restore();
    setAuthToken(null);
  });

  it("loads the course completion with the auth header", async () => {
    api.onGet("/stats/completion").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      return [200, ok(COMPLETION, "Course completion retrieved successfully")];
    });
    await expect(getCompletion()).resolves.toEqual(COMPLETION);
  });

  it("passes the abort signal on", async () => {
    const controller = new AbortController();
    api.onGet("/stats/completion").reply((config) => {
      expect(config.signal).toBe(controller.signal);
      return [200, ok(COMPLETION)];
    });
    await getCompletion({ signal: controller.signal });
  });

  it("turns failures into ApiError with the server message", async () => {
    api.onGet("/stats/completion").reply(500, { status: false, message: "Something went wrong", data: null });
    await expect(getCompletion()).rejects.toMatchObject({ constructor: ApiError, status: 500, message: "Something went wrong" });
  });

  it("rejects an answer that isn't a success envelope", async () => {
    api.onGet("/stats/completion").reply(200, { status: false, message: "", data: null });
    await expect(getCompletion()).rejects.toMatchObject({ constructor: ApiError, message: "Unable to load your course completion." });
  });

  it("loads the overall numbers with the auth header and the abort signal", async () => {
    const controller = new AbortController();
    api.onGet("/stats/overview").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      expect(config.signal).toBe(controller.signal);
      return [200, ok(OVERVIEW, "Overall statistics retrieved successfully")];
    });
    await expect(getOverview({ signal: controller.signal })).resolves.toEqual(OVERVIEW);
  });

  it("turns overview failures into ApiError, with a message of its own when the server gives none", async () => {
    api.onGet("/stats/overview").replyOnce(401, { status: false, message: "Not authenticated", data: null });
    await expect(getOverview()).rejects.toMatchObject({ constructor: ApiError, status: 401 });
    api.onGet("/stats/overview").replyOnce(200, { status: false, message: "", data: null });
    await expect(getOverview()).rejects.toMatchObject({ constructor: ApiError, message: "Unable to load your overall numbers." });
  });
});
