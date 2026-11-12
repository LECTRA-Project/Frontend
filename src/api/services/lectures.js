import { ApiError } from "../client.js";
import { del, get, patch, post } from "../http.js";

/*
  LECTURES SERVICE — the four Student Profile lecture APIs the backend provides.

    GET    /student_profile/lectures                     listLectures
    POST   /student_profile/upload-lecture               uploadLecture  (multipart: title, file)
    PATCH  /student_profile/lectures/{id}                updateLecture  (JSON: title)
    DELETE /student_profile/lectures/{id}                deleteLecture

  The backend has no per-lecture GET, file, content, reprocess or "ask" endpoints, so
  the frontend never calls them: stored files are opened from the lecture's `s3_url`,
  and the Study Assistant uses the Lecture Chat API (see chat.js).
*/
const BASE = "/student_profile";

// Uploads can be large; the default 15 s timeout is for ordinary requests.
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
// Tells axios to keep the FormData (the browser then sets the multipart boundary itself).
const MULTIPART = { "Content-Type": "multipart/form-data" };

function unwrap(response, action) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || `Unable to ${action}.`, data: response });
  }
  return response.data;
}

export async function listLectures({ page = 1, pageSize = 100, search, fileType, course, status, signal } = {}) {
  const params = { page, page_size: pageSize };
  if (search) params.search = search;
  if (fileType) params.file_type = fileType;
  if (course) params.course = course;
  if (status) params.processing_status = status;
  return unwrap(await get(`${BASE}/lectures`, { params, signal }), "load your lectures");
}

/* All lectures across pages (the backend allows at most 100 per page). */
export async function listAllLectures({ signal } = {}) {
  const first = await listLectures({ page: 1, pageSize: 100, signal });
  const lectures = [...first.lectures];
  for (let page = 2; page <= first.total_pages; page += 1) {
    lectures.push(...(await listLectures({ page, pageSize: 100, signal })).lectures);
  }
  return lectures;
}

export async function uploadLecture({ file, title, description, course, onProgress, signal }) {
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
  if (description) form.append("description", description);
  if (course) form.append("course", course);
  const response = await post(`${BASE}/upload-lecture`, form, {
    headers: MULTIPART,
    timeout: UPLOAD_TIMEOUT_MS,
    signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return unwrap(response, "upload the lecture");
}

/*
  Partial update. Only the keys you pass are sent:
    { title, description, course }  → JSON
    with `file`                      → multipart (replaces the file; the backend reprocesses it)
  description/course: "" or null clears them.
*/
export async function updateLecture(id, { title, description, course, file, onProgress } = {}) {
  const changes = {};
  if (title !== undefined) changes.title = title;
  if (description !== undefined) changes.description = description;
  if (course !== undefined) changes.course = course;

  let response;
  if (file) {
    const form = new FormData();
    for (const [key, value] of Object.entries(changes)) form.append(key, value ?? "");
    form.append("file", file);
    response = await patch(`${BASE}/lectures/${id}`, form, {
      headers: MULTIPART,
      timeout: UPLOAD_TIMEOUT_MS,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
  } else {
    response = await patch(`${BASE}/lectures/${id}`, changes);
  }
  return unwrap(response, "update the lecture");
}

export async function deleteLecture(id) {
  return unwrap(await del(`${BASE}/lectures/${id}`), "delete the lecture");
}
