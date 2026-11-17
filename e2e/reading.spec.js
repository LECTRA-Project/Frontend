import { expect, test } from "@playwright/test";

import { api, createChat, newStudent, signIn, uploadLecture } from "./support/backend.js";

/*
  Reading progress: a page counts once it stayed on screen for 2 seconds; the viewer shows
  "Read N of 6" and the backend has the pages (and some study time).
*/
test("reading the lecture page by page counts every page", async ({ page }) => {
  const student = await newStudent();
  const lecture = await uploadLecture(student);
  const chat = await createChat(student, [lecture.id]);
  await signIn(page, student);
  await page.goto(`/workspace?chat=${chat.id}&lecture=${lecture.id}`);

  const label = page.getByTestId("reading-progress");
  await expect(page.locator(".pdf-page").first()).toBeVisible({ timeout: 30_000 });
  await expect(label).toHaveText(/Read 0 of 6/);

  for (let step = 0; step < 6; step += 1) {
    await page.waitForTimeout(2600); // longer than the 2 s a page needs on screen
    if (step < 5) await page.getByRole("button", { name: "Next page" }).click();
  }
  await expect(label).toHaveText(/Read 6 of 6/, { timeout: 20_000 });

  // Closing the viewer sends what is left; the backend has every page.
  await page.getByRole("button", { name: "Close the material viewer" }).click();
  await expect.poll(async () => (await api(`/student_profile/lectures/${lecture.id}/progress`, { token: student.token })).data.viewed).toBe(6);
});
