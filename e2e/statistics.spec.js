import { expect, test } from "@playwright/test";

import { api, newStudent, signIn, takeExam, uploadLecture } from "./support/backend.js";

/* The card on the Statistics page with this label: its value. */
const cardValue = (section, label) => section.locator(".overview__card", { has: section.page().locator("dt", { hasText: label }) }).locator(".overview__value");

test("a new student sees how to start, with one upload button", async ({ page }) => {
  const student = await newStudent();
  await signIn(page, student);
  await page.goto("/statistics");
  await expect(page.getByText("Your numbers will show here")).toBeVisible();
  await expect(page.getByText("Your lectures will show here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload a lecture" })).toHaveCount(1);
});

test("the numbers follow what the student did, also per project", async ({ page }) => {
  const student = await newStudent();
  const lecture = await uploadLecture(student);
  // Read pages 1–3 for 2 minutes, and take an exam (choice "b" is right with the fake LLM).
  await api(`/student_profile/lectures/${lecture.id}/progress`, { token: student.token, method: "POST", body: { pages: [1, 2, 3], seconds: 120 } });
  const exam = await takeExam(student, [lecture.id]);
  expect(exam.status).toBe("ready");
  const answers = exam.questions.map((question) =>
    question.type === "multiple_choice" ? { task_id: question.id, selected_choice_ids: ["b"] } : { task_id: question.id, answer_text: "A tree splits by attributes." }
  );
  expect((await api(`/exams/${exam.id}/submit`, { token: student.token, method: "POST", body: { answers } })).http).toBe(200);
  const project = (await api("/student_profile/projects", { token: student.token, method: "POST", body: { name: "Machine Learning" } })).data;
  await api(`/student_profile/projects/${project.id}/lectures`, { token: student.token, method: "POST", body: { lecture_id: lecture.id } });

  await signIn(page, student);
  await page.goto("/statistics");
  const overall = page.getByRole("region", { name: "Overall" });
  await expect(overall.locator("dl.overview__cards")).toBeVisible();
  await expect(cardValue(overall, "Exams taken")).toHaveText("1");
  await expect(cardValue(overall, "Pages read")).toHaveText("3");
  await expect(cardValue(overall, "Study time")).toHaveText("2 min");
  await expect(page.getByRole("figure", { name: "Study time per day, last 4 weeks" })).toBeVisible();

  // Exam performance lists the exam; course completion the lecture.
  await expect(page.getByRole("region", { name: "Exam performance" })).toContainText("Decision trees");
  const completion = page.getByRole("list", { name: "Lectures, least complete first" });
  await expect(completion.getByRole("listitem")).toHaveCount(1);
  await expect(completion).toContainText("Decision trees");

  // One project: the same numbers, and the choice is in the URL.
  await page.getByRole("combobox", { name: "Project" }).selectOption(project.id);
  await expect(page).toHaveURL(new RegExp(`project=${project.id}`));
  await expect(cardValue(overall, "Pages read")).toHaveText("3");
  await expect(cardValue(overall, "Exams taken")).toHaveText("1");
});
