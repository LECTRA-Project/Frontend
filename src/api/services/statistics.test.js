import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import { getCompletion, getExamStats, getOverview } from "./statistics.js";
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

const EXAMS = {
  exams_submitted: 2,
  exams_scored: 1,
  average_percent: 67,
  best_percent: 67,
  history: [
    { exam_id: "e2", title: "KI 02", submitted_at: "2026-11-16T09:00:00+00:00", lectures: [{ lecture_id: "a", title: "KI 02" }], question_count: 3, score_percent: null },
    { exam_id: "e1", title: "KI 02", submitted_at: "2026-11-10T09:00:00+00:00", lectures: [{ lecture_id: "a", title: "KI 02" }], question_count: 3, score_percent: 67 },
  ],
  by_week: [{ week_start: "2026-11-09", exams: 1, average_percent: 67 }],
  by_lecture: [{ lecture_id: "a", title: "KI 02", exams: 1, average_percent: 67, best_percent: 67 }],
  by_type: [{ type: "multiple_choice", questions: 3, correct: 2, correct_percent: 67, points_percent: 67 }],
  weakest_concepts: [],
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

  it("loads the exam performance with the auth header, and no dates by default", async () => {
    api.onGet("/stats/exams").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      expect(config.params).toEqual({});
      return [200, ok(EXAMS, "Exam statistics retrieved successfully")];
    });
    await expect(getExamStats()).resolves.toEqual(EXAMS);
  });

  it("sends from / to and the abort signal for the exam performance", async () => {
    const controller = new AbortController();
    api.onGet("/stats/exams").reply((config) => {
      expect(config.params).toEqual({ from: "2026-10-20", to: "2026-11-16" });
      expect(config.signal).toBe(controller.signal);
      return [200, ok(EXAMS)];
    });
    await getExamStats({ from: "2026-10-20", to: "2026-11-16", signal: controller.signal });

    api.onGet("/stats/exams").reply((config) => [200, ok({ ...EXAMS, params: config.params })]);
    await expect(getExamStats({ from: "2026-10-20" })).resolves.toMatchObject({ params: { from: "2026-10-20" } });
  });

  it("turns exam performance failures into ApiError", async () => {
    api.onGet("/stats/exams").replyOnce(422, { status: false, message: "from must not be after to", data: null });
    await expect(getExamStats({ from: "2026-12-01", to: "2026-11-01" })).rejects.toMatchObject({
      constructor: ApiError,
      status: 422,
      message: "from must not be after to",
    });
    api.onGet("/stats/exams").replyOnce(200, { status: false, message: "", data: null });
    await expect(getExamStats()).rejects.toMatchObject({ constructor: ApiError, message: "Unable to load your exam performance." });
  });

  it("asks for one project's numbers with project_id, and for everything without", async () => {
    const seen = [];
    for (const path of ["/stats/completion", "/stats/overview", "/stats/exams"]) {
      api.onGet(path).reply((config) => {
        seen.push([path, config.params ?? {}]);
        return [200, ok(path === "/stats/completion" ? COMPLETION : path === "/stats/overview" ? OVERVIEW : {})];
      });
    }
    await getCompletion({ projectId: "p-ml" });
    await getOverview({ projectId: "p-ml" });
    await getExamStats({ projectId: "p-ml", from: "2026-11-01" });
    await getOverview();
    expect(seen).toEqual([
      ["/stats/completion", { project_id: "p-ml" }],
      ["/stats/overview", { project_id: "p-ml" }],
      ["/stats/exams", { project_id: "p-ml", from: "2026-11-01" }],
      ["/stats/overview", {}],
    ]);
  });
});

