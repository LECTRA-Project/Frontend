import { ApiError } from "../client.js";
import { t } from "../../i18n/i18n.js";
import { del, get, patch, post } from "../http.js";

/*
  PROJECTS SERVICE — a course's materials and chats grouped together, like projects in ChatGPT.

    POST   /student_profile/projects                          createProject
    GET    /student_profile/projects                          listProjects
    GET    /student_profile/projects/{id}                     getProject
    PATCH  /student_profile/projects/{id}                     renameProject
    DELETE /student_profile/projects/{id}                     deleteProject
    POST   /student_profile/projects/{id}/lectures            addProjectLecture
    DELETE /student_profile/projects/{id}/lectures/{lid}      removeProjectLecture
    GET    /student_profile/projects/{id}/sessions            listProjectChats
    POST   /student_profile/projects/{id}/sessions            createProjectChat

  Every chat of a project answers from the project's materials (a project without materials
  answers from general knowledge). Moving a chat in or out: see chat.js.

  Shapes (data of the { status, message, data } envelope):
    project  { id, name, chat_count, material_count, created_at, updated_at,
               lectures: [lecture] }   (lectures: not in the list; each lecture as
                                        GET /student_profile/lectures/{id} returns it)
             updated_at is the last activity: creation, or the newest message in its chats.
*/
const BASE = "/student_profile/projects";

// The sidebar shows the 3 most recently active; the "All projects" page 30 per page.
export const RECENT_PROJECTS = 3;
export const PROJECTS_PAGE_SIZE = 30;

function unwrap(response, fallback) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || fallback, data: response });
  }
  return response.data;
}

export async function createProject(name) {
  return unwrap(await post(BASE, { name }), t("Unable to create the project."));
}

/* One page, most recently active first: { projects, page, page_size, total, total_pages }. */
export async function listProjects({ page = 1, pageSize = PROJECTS_PAGE_SIZE, signal } = {}) {
  const response = await get(BASE, { params: { page, page_size: pageSize }, signal });
  return unwrap(response, t("Unable to load your projects."));
}

export async function getProject(id, { signal } = {}) {
  return unwrap(await get(`${BASE}/${id}`, { signal }), t("Unable to load the project."));
}

export async function renameProject(id, name) {
  return unwrap(await patch(`${BASE}/${id}`, { name }), t("Unable to rename the project."));
}

/* Deletes the project with its chats and their messages: { id, deleted_chats }. */
export async function deleteProject(id) {
  return unwrap(await del(`${BASE}/${id}`), t("Unable to delete the project."));
}

/* Adds one of the student's lectures to the project; returns the updated project. */
export async function addProjectLecture(id, lectureId) {
  return unwrap(await post(`${BASE}/${id}/lectures`, { lecture_id: lectureId }), t("Unable to add the material to this project."));
}

/* Removes a lecture from the project (the lecture itself is kept); returns the updated project. */
export async function removeProjectLecture(id, lectureId) {
  return unwrap(await del(`${BASE}/${id}/lectures/${lectureId}`), t("Unable to remove the material from this project."));
}

/* The project's chats, most recently active first: { sessions, page, page_size, total, total_pages }. */
export async function listProjectChats(id, { page = 1, pageSize = 20, signal } = {}) {
  const response = await get(`${BASE}/${id}/sessions`, { params: { page, page_size: pageSize }, signal });
  return unwrap(response, t("Unable to load the project's chats."));
}

/* A new chat in the project (a session, as in chat.js). */
export async function createProjectChat(id, { title } = {}) {
  const body = {};
  if (title) body.title = title;
  return unwrap(await post(`${BASE}/${id}/sessions`, body, { timeout: 60000 }), t("Unable to start a chat."));
}
