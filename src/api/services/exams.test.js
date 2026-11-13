import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import { deleteExam, getExam, isUnfinished, listAllExams, listExams, regradeExam, startExam, submitExam } from "./exams.js";
import { mockApi, ok } from "../../test/helpers.jsx";

const exam = (id, status = "generating") => ({ id, title: "KI 02", status, question_count: 5, questions_ready: 0, lectures: [], error: null });

describe("exams service", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    setAuthToken("test-token");
  });

  afterEach(() => {
    api.restore();
    setAuthToken(null);
  });

  it("starts an exam with the backend's field names and returns the generating exam", async () => {
    api.onPost("/exams").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      expect(JSON.parse(config.data)).toEqual({ lecture_ids: ["l-1", "l-2"], question_count: 3, types: ["short_answer"] });
      return [202, ok(exam("e-1"), "The exam is being generated")];
    });
    const started = await startExam({ lectureIds: ["l-1", "l-2"], questionCount: 3, types: ["short_answer"] });
    expect(started).toMatchObject({ id: "e-1", status: "generating" });
  });

  it("reports 409 and 422 with the backend's message and status", async () => {
    api.onPost("/exams").replyOnce(409, { status: false, message: "An exam is already being generated. Wait until it is ready, then start the next one", data: null });
    api.onPost("/exams").replyOnce(422, { status: false, message: "“KI 03” has no readable text yet, so no questions can be made from it", data: null });
    const settings = { lectureIds: ["l-1"], questionCount: 5, types: ["multiple_choice"] };

    const busy = await startExam(settings).catch((err) => err);
    expect(busy).toBeInstanceOf(ApiError);
    expect(busy.status).toBe(409);
    expect(busy.message).toMatch(/already being generated/);

    const noText = await startExam(settings).catch((err) => err);
    expect(noText.status).toBe(422);
    expect(noText.message).toMatch(/“KI 03” has no readable text/);
  });

  it("reads an exam with its questions", async () => {
    const question = { id: "q-1", position: 1, type: "multiple_choice", question: "Which?", choices: [{ id: "a", text: "A" }], points: 1, lecture_id: "l-1", source_pages: [3] };
    api.onGet("/exams/e-1").reply(200, ok({ ...exam("e-1", "ready"), questions: [question] }));
    const read = await getExam("e-1");
    expect(read.status).toBe("ready");
    expect(read.questions).toEqual([question]);
  });

  it("lists a page of the history and all pages together", async () => {
    api.onGet("/exams").reply((config) => {
      const { page, page_size: size } = config.params;
      const all = [exam("e-3"), exam("e-2", "ready"), exam("e-1", "submitted")];
      return [200, ok({ exams: all.slice((page - 1) * size, page * size), page, page_size: size, total: 3, total_pages: Math.ceil(3 / size) })];
    });
    expect((await listExams({ pageSize: 2 })).exams.map((item) => item.id)).toEqual(["e-3", "e-2"]);
    expect((await listAllExams()).map((item) => item.id)).toEqual(["e-3", "e-2", "e-1"]);
  });

  it("discards an exam, and reports a submitted one", async () => {
    api.onDelete("/exams/e-1").reply(200, ok({ id: "e-1" }, "Exam deleted"));
    api.onDelete("/exams/e-2").reply(409, { status: false, message: "A submitted exam stays in your history and can't be deleted", data: null });
    expect(await deleteExam("e-1")).toEqual({ id: "e-1" });
    await expect(deleteExam("e-2")).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/stays in your history/) });
  });

  it("submits the given answers in the backend's shape, leaving out empty ones", async () => {
    const questions = [
      { id: "q-1", type: "multiple_choice" },
      { id: "q-2", type: "short_answer" },
      { id: "q-3", type: "multiple_choice" },
      { id: "q-4", type: "short_answer" },
    ];
    api.onPost("/exams/e-1/submit").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({
        answers: [
          { task_id: "q-1", selected_choice_ids: ["a", "c"] },
          { task_id: "q-2", answer_text: "A leaf" },
        ],
      });
      expect(config.timeout).toBeGreaterThanOrEqual(300000);
      return [200, ok({ ...exam("e-1", "submitted"), total_points: 2, max_points: 4, score_percent: 50, questions_ungraded: 0 }, "Exam submitted and graded")];
    });
    const submitted = await submitExam("e-1", questions, { "q-1": ["a", "c"], "q-2": "A leaf", "q-3": [], "q-4": "   " });
    expect(submitted).toMatchObject({ status: "submitted", score_percent: 50 });
  });

  it("reports 409 and 422 on submit, and regrades", async () => {
    api.onPost("/exams/e-1/submit").replyOnce(409, { status: false, message: "This exam was already submitted", data: null });
    api.onPost("/exams/e-1/submit").replyOnce(422, { status: false, message: "Unknown choice ids: z", data: null });
    await expect(submitExam("e-1", [], {})).rejects.toMatchObject({ status: 409, message: "This exam was already submitted" });
    await expect(submitExam("e-1", [], {})).rejects.toMatchObject({ status: 422, message: "Unknown choice ids: z" });

    api.onPost("/exams/e-1/regrade").replyOnce(200, ok({ ...exam("e-1", "submitted"), questions_ungraded: 0 }, "Exam graded"));
    api.onPost("/exams/e-1/regrade").replyOnce(409, { status: false, message: "Every answer of this exam is graded already", data: null });
    expect(await regradeExam("e-1")).toMatchObject({ questions_ungraded: 0 });
    await expect(regradeExam("e-1")).rejects.toMatchObject({ status: 409 });
  });

  it("throws when the envelope says the call failed", async () => {
    api.onGet("/exams/e-1").reply(200, { status: false, message: "Nope", data: null });
    await expect(getExam("e-1")).rejects.toThrow("Nope");
  });

  it("counts generating and ready exams as unfinished", () => {
    expect(["generating", "ready", "failed", "submitted"].map((status) => isUnfinished({ status }))).toEqual([true, true, false, false]);
  });
});
