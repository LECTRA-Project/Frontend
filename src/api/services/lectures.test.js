import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, setAuthToken } from "../client.js";
import {
  deleteLecture,
  getReadingProgress,
  listAllLectures,
  listLectures,
  recordReadingProgress,
  recordReadingProgressKeepalive,
  renameLecture,
  reprocessLecture,
  uploadLecture,
} from "./lectures.js";
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
      expect(config.params).toEqual({ page: 2, page_size: 10, search: "search", file_type: "pdf" });
      return [200, ok({ lectures: [lecture("a")], total: 1, total_pages: 1 })];
    });
    const data = await listLectures({ page: 2, pageSize: 10, search: "search", fileType: "pdf" });
    expect(data.lectures).toHaveLength(1);
  });

  it("loads every page of lectures", async () => {
    api.onGet("/student_profile/lectures").reply((config) => {
      const page = config.params.page;
      return [200, ok({ lectures: [lecture(`p${page}`)], total: 2, total_pages: 2, page })];
    });
    expect((await listAllLectures()).map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  it("uploads multipart form data with only the title and the file", async () => {
    api.onPost("/student_profile/upload-lecture").reply((config) => {
      expect(config.data).toBeInstanceOf(FormData);
      expect([...config.data.keys()]).toEqual(["title", "file"]);
      expect(config.data.get("title")).toBe("Search");
      expect(config.data.get("file").name).toBe("search.pdf");
      return [201, ok(lecture("new"), "Lecture uploaded successfully")];
    });
    const file = new File(["%PDF-"], "search.pdf", { type: "application/pdf" });
    await expect(uploadLecture({ file, title: "Search" })).resolves.toEqual(lecture("new"));
  });

  it("renames a lecture with a JSON body holding only the title", async () => {
    api.onPatch("/student_profile/lectures/a").reply((config) => {
      expect(config.headers["Content-Type"]).toMatch(/application\/json/);
      expect(JSON.parse(config.data)).toEqual({ title: "Week 3" });
      return [200, ok({ ...lecture("a"), title: "Week 3" })];
    });
    await expect(renameLecture("a", "Week 3")).resolves.toMatchObject({ title: "Week 3" });
  });

  it("deletes and reprocesses lectures", async () => {
    api.onDelete("/student_profile/lectures/a").reply(200, ok({ id: "a" }));
    api.onPost("/student_profile/lectures/a/reprocess").reply(202, ok({ ...lecture("a"), processing_status: "pending" }));
    await expect(deleteLecture("a")).resolves.toEqual({ id: "a" });
    await expect(reprocessLecture("a")).resolves.toMatchObject({ processing_status: "pending" });
  });

  it("turns backend errors into ApiError with the server message", async () => {
    api.onPatch("/student_profile/lectures/a").reply(422, {
      status: false,
      message: "Title must contain 1 to 255 characters",
      data: { errors: [] },
    });
    await expect(renameLecture("a", " ")).rejects.toMatchObject({
      constructor: ApiError,
      status: 422,
      message: "Title must contain 1 to 255 characters",
    });
  });

  it("reads and records the reading progress", async () => {
    const progress = { viewed_pages: [1, 2, 5], viewed: 3, total: 65, percent: 5 };
    api.onGet("/student_profile/lectures/a/progress").reply(200, ok(progress));
    api.onPost("/student_profile/lectures/a/progress").reply((config) => {
      expect(config.headers.Authorization).toBe("Bearer test-token");
      expect(JSON.parse(config.data)).toEqual({ pages: [1, 2, 5] });
      return [200, ok(progress, "Reading progress saved")];
    });
    await expect(getReadingProgress("a")).resolves.toEqual(progress);
    await expect(recordReadingProgress("a", [1, 2, 5])).resolves.toEqual(progress);
  });

  describe("keepalive progress (tab hidden or page closing)", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("posts with keepalive and the auth header", async () => {
      const progress = { viewed_pages: [7], viewed: 1, total: 65, percent: 2 };
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(ok(progress)), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(recordReadingProgressKeepalive("a", [7])).resolves.toEqual(progress);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/student_profile/lectures/a/progress");
      expect(init).toMatchObject({ method: "POST", keepalive: true, body: JSON.stringify({ pages: [7] }) });
      expect(init.headers.Authorization).toBe("Bearer test-token");
    });

    it("rejects with the HTTP status when the request fails", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
      await expect(recordReadingProgressKeepalive("gone", [1])).rejects.toMatchObject({ constructor: ApiError, status: 404 });
    });
  });
});
