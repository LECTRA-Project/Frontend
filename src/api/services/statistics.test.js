import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import { getCompletion } from "./statistics.js";
import { mockApi, ok } from "../../test/helpers.jsx";

const COMPLETION = {
  lectures: [
    { lecture_id: "a", title: "KI 02", source_type: "page", viewed: 33, total: 65, reading_percent: 51, best_exam_percent: 50, completion_percent: 51 },
  ],
  overall_percent: 51,
  weights: { reading: 70, exam: 30 },
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
});
