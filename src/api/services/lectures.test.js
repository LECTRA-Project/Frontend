import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import { deleteLecture, listAllLectures, listLectures, updateLecture, uploadLecture } from "./lectures.js";
import { mockApi, ok } from "../../test/helpers.jsx";

const lecture = (id) => ({ id, title: `Lecture ${id}`, processing_status: "completed", content_version: 1 });

describe("lectures service", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    setAuthToken("test-token");
  });

  afterEach(() => {
    api.restore();
    setAuthToken(null);
  });

  it("lists lectures with the backend query names and an auth header", async () => {
    api.onGet("/student_profile/lectures").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      expect(config.params).toEqual({ page: 2, page_size: 10, course: "AI", processing_status: "failed" });
      return [200, ok({ lectures: [lecture("a")], total: 1, total_pages: 1 })];
    });
    const data = await listLectures({ page: 2, pageSize: 10, course: "AI", status: "failed" });
    expect(data.lectures).toHaveLength(1);
  });

  it("loads every page of lectures", async () => {
    api.onGet("/student_profile/lectures").reply((config) => {
      const page = config.params.page;
      return [200, ok({ lectures: [lecture(`p${page}`)], total: 2, total_pages: 2, page })];
    });
    expect((await listAllLectures()).map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  it("uploads multipart form data with title, course and file", async () => {
    api.onPost("/student_profile/upload-lecture").reply((config) => {
      expect(config.data).toBeInstanceOf(FormData);
      expect(config.data.get("title")).toBe("Search");
      expect(config.data.get("course")).toBe("AI");
      expect(config.data.get("file").name).toBe("search.pdf");
      expect(config.data.has("description")).toBe(false);
      return [201, ok(lecture("new"), "Lecture uploaded successfully")];
    });
    const file = new File(["%PDF-"], "search.pdf", { type: "application/pdf" });
    await expect(uploadLecture({ file, title: "Search", course: "AI" })).resolves.toEqual(lecture("new"));
  });

  it("sends metadata-only edits as JSON with only the changed fields", async () => {
    api.onPatch("/student_profile/lectures/a").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ course: "", description: "Week 3" });
      return [200, ok(lecture("a"))];
    });
    await updateLecture("a", { course: "", description: "Week 3" });
  });

  it("sends a file replacement as multipart", async () => {
    api.onPatch("/student_profile/lectures/a").reply((config) => {
      expect(config.data).toBeInstanceOf(FormData);
      expect(config.data.get("title")).toBe("New");
      expect(config.data.get("file").name).toBe("new.pptx");
      return [200, ok({ ...lecture("a"), processing_status: "pending", content_version: 2 })];
    });
    const result = await updateLecture("a", { title: "New", file: new File(["x"], "new.pptx") });
    expect(result.content_version).toBe(2);
  });

  it("deletes lectures", async () => {
    api.onDelete("/student_profile/lectures/a").reply(200, ok({ id: "a" }));
    await expect(deleteLecture("a")).resolves.toEqual({ id: "a" });
  });

  it("turns backend errors into ApiError with the server message", async () => {
    api.onGet("/student_profile/lectures").reply(503, {
      status: false,
      message: "The server is unavailable right now. Please try again later.",
      data: null,
    });
    await expect(listLectures()).rejects.toMatchObject({
      constructor: ApiError,
      status: 503,
      message: "The server is unavailable right now. Please try again later.",
    });
  });

  it("offers only the four lecture endpoints the backend has", async () => {
    const service = await import("./lectures.js");
    expect(Object.keys(service).sort()).toEqual(["deleteLecture", "listAllLectures", "listLectures", "updateLecture", "uploadLecture"]);
  });
});
