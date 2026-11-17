/*
  The browser tests talk to a real local backend: they create their own student for each
  test (a fresh account, nothing shared) and set up what a test needs through the API.

    E2E_BACKEND_URL   the backend (default http://127.0.0.1:8000)
*/
import { makePdf, LECTURE_PAGES } from "./pdf.js";

export const BACKEND = (process.env.E2E_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
export const API = `${BACKEND}/api`;
const PASSWORD = "E2eTest!23456"; // 8 to 14 characters

export async function api(path, { token, method = "GET", body, form } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, http: response.status };
}

/* A new student, signed in: { email, token, refreshToken, id }. */
export async function newStudent() {
  const email = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const registered = await api("/auth/register", { method: "POST", body: { email, password: PASSWORD, full_name: "E2E Student" } });
  if (registered.http >= 300) throw new Error(`register: ${registered.http} ${registered.message}`);
  const session = (await api("/auth/login", { method: "POST", body: { email, password: PASSWORD } })).data;
  const me = (await api("/users/me", { token: session.token })).data;
  return { email, token: session.token, refreshToken: session.refresh_token, id: me.id };
}

/* Uploads the test lecture (6 pages about decision trees) and waits until its text is read. */
export async function uploadLecture(student, title = "Decision trees") {
  const form = new FormData();
  form.append("title", title);
  form.append("file", new Blob([makePdf(LECTURE_PAGES)], { type: "application/pdf" }), "decision-trees.pdf");
  const uploaded = await api("/student_profile/upload-lecture", { token: student.token, method: "POST", form });
  if (uploaded.http >= 300) throw new Error(`upload: ${uploaded.http} ${uploaded.message}`);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const lecture = (await api(`/student_profile/lectures/${uploaded.data.id}`, { token: student.token })).data;
    if (lecture.processing_status === "completed") return lecture;
    if (lecture.processing_status === "failed") throw new Error("the test lecture could not be processed");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("the test lecture was not processed in time");
}

export async function createChat(student, lectureIds) {
  return (await api("/student_profile/chat/sessions", { token: student.token, method: "POST", body: { lecture_ids: lectureIds } })).data;
}

/* Starts an exam and waits until it is ready (or failed). */
export async function takeExam(student, lectureIds, { questionCount = 3 } = {}) {
  let exam = (await api("/exams", { token: student.token, method: "POST", body: { lecture_ids: lectureIds, question_count: questionCount } })).data;
  for (let attempt = 0; attempt < 240 && exam.status === "generating"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    exam = (await api(`/exams/${exam.id}`, { token: student.token })).data;
  }
  return exam;
}

/* Opens the app signed in as the student (the token in localStorage, as after a login). */
export async function signIn(page, student) {
  await page.goto("/");
  await page.evaluate(([token, refresh]) => {
    localStorage.setItem("lectra.authToken", token);
    if (refresh) localStorage.setItem("lectra.refreshToken", refresh);
  }, [student.token, student.refreshToken]);
}
