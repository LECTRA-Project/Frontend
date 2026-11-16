import { API_BASE_URL, apiClient, ApiError, getAuthToken } from "../client.js";
import { t } from "../../i18n/i18n.js";
import { del, get, patch, post } from "../http.js";

/*
  LECTURES SERVICE — the Student Profile lecture APIs.

    GET    /student_profile/lectures                     listLectures / listAllLectures
    POST   /student_profile/upload-lecture               uploadLecture
    PATCH  /student_profile/lectures/{id}                renameLecture  (JSON { title })
    DELETE /student_profile/lectures/{id}                deleteLecture
    GET    /student_profile/lectures/{id}                getLecture / detectServerFeatures (probe)
    POST   /student_profile/lectures/{id}/reprocess      reprocessLecture
    GET    /student_profile/lectures/{id}/content        getLectureContent
    GET    /student_profile/lectures/{id}/file           fetchLectureFile (Blob)
    GET    /student_profile/lectures/{id}/progress       getReadingProgress
    POST   /student_profile/lectures/{id}/progress       recordReadingProgress / recordReadingProgressKeepalive

  The backend stores a lecture's title and file only: there is no course or description.
*/
const BASE = "/student_profile";

// Uploads can be large; the default 15 s timeout is for ordinary requests.
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
// Tells axios to keep the FormData (the browser then sets the multipart boundary itself).
const MULTIPART = { "Content-Type": "multipart/form-data" };

/* `fallback`: the message when the server gives none (translated by the caller). */
function unwrap(response, fallback) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || fallback, data: response });
  }
  return response.data;
}

export async function listLectures({ page = 1, pageSize = 100, search, fileType, signal } = {}) {
  const params = { page, page_size: pageSize };
  if (search) params.search = search;
  if (fileType) params.file_type = fileType;
  return unwrap(await get(`${BASE}/lectures`, { params, signal }), t("Unable to load your lectures."));
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

export async function uploadLecture({ file, title, onProgress, signal }) {
  const form = new FormData();
  form.append("title", title);
  form.append("file", file);
  const response = await post(`${BASE}/upload-lecture`, form, {
    headers: MULTIPART,
    timeout: UPLOAD_TIMEOUT_MS,
    signal,
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return unwrap(response, t("Unable to upload the lecture."));
}

/* Renames a lecture. The backend accepts only { title } (1–255 characters) and rejects other fields. */
export async function renameLecture(id, title) {
  return unwrap(await patch(`${BASE}/lectures/${id}`, { title }), t("Unable to rename the lecture."));
}

export async function deleteLecture(id) {
  return unwrap(await del(`${BASE}/lectures/${id}`), t("Unable to delete the lecture."));
}

/* One lecture (the same object as in the list, e.g. with its current completion_percent). */
export async function getLecture(id, { signal } = {}) {
  return unwrap(await get(`${BASE}/lectures/${id}`, { signal }), t("Unable to load the lecture."));
}

/*
  Which backend version are we talking to? One read-only request for a lecture id that
  cannot exist: the AI-enabled backend answers 404 ("Lecture not found"); a backend
  without AI processing has no GET route there and answers 405 (Method Not Allowed).
  Returns { ai: true | false }; ai is false only for that clear 405.
*/
const PROBE_ID = "00000000-0000-0000-0000-000000000000";

export async function detectServerFeatures({ signal } = {}) {
  try {
    await get(`${BASE}/lectures/${PROBE_ID}`, { signal });
    return { ai: true };
  } catch (err) {
    if (err?.name === "CanceledError") throw err;
    return { ai: err?.status !== 405 };
  }
}

export async function reprocessLecture(id) {
  return unwrap(await post(`${BASE}/lectures/${id}/reprocess`), t("Unable to retry processing."));
}

export async function getLectureContent(id, { page = 1, pageSize = 1000, signal } = {}) {
  const response = await get(`${BASE}/lectures/${id}/content`, { params: { page, page_size: pageSize }, signal });
  return unwrap(response, t("Unable to load the lecture content."));
}

/* The original file as a Blob (the request carries the auth token, so a plain link would not work). */
export async function fetchLectureFile(id, { signal } = {}) {
  const response = await apiClient.get(`${BASE}/lectures/${id}/file`, {
    responseType: "blob",
    timeout: UPLOAD_TIMEOUT_MS,
    signal,
  });
  return response.data;
}

/*
  Reading progress: which pages (slides, cells) of a lecture the student has opened.
  Both calls answer { viewed_pages, viewed, total, percent }. `pages` holds 1 to 200 page
  numbers; pages the lecture doesn't have are ignored, and sending a page again is harmless.
*/
export async function getReadingProgress(id, { signal } = {}) {
  return unwrap(await get(`${BASE}/lectures/${id}/progress`, { signal }), t("Unable to load the reading progress."));
}

export async function recordReadingProgress(id, pages) {
  return unwrap(await post(`${BASE}/lectures/${id}/progress`, { pages }), t("Unable to save the reading progress."));
}

/*
  The same POST for a page that is being hidden or closed: a keepalive fetch outlives the
  page (axios can't ask for that, and sendBeacon can't send the Authorization header).
  No session refresh here: a rejected token just fails, and the caller tries again later.
*/
export async function recordReadingProgressKeepalive(id, pages) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${BASE}/lectures/${id}/progress`, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ pages }),
  });
  if (!response.ok) throw new ApiError({ message: t("Unable to save the reading progress."), status: response.status });
  return unwrap(await response.json(), t("Unable to save the reading progress."));
}
