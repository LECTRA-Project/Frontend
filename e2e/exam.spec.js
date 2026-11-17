import { expect, test } from "@playwright/test";

import { createChat, newStudent, signIn, uploadLecture } from "./support/backend.js";

/*
  An exam from the chat's materials: set up, answer (multiple choice and short answer),
  review, submit, the checked results, and "Ask about this" on a wrong answer.
  With the fake LLM (the default) the answers are known: choice "b" is always right and a
  short answer gets 2 of 3 points. With E2E_LLM=real only the flow is checked.
*/
const mocked = (process.env.E2E_LLM || "mock") !== "real";
test("an exam from set up to results, then asking about a wrong answer", async ({ page }) => {
  const student = await newStudent();
  const lecture = await uploadLecture(student);
  const chat = await createChat(student, [lecture.id]);
  await signIn(page, student);
  await page.goto(`/workspace/exam?chat=${chat.id}`);

  // Set up: the chat's material is chosen; 3 questions, both types.
  await expect(page.getByRole("heading", { name: "New exam" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Decision trees/ })).toBeChecked();
  await page.getByRole("radio", { name: "3" }).check();
  await page.getByRole("button", { name: "Generate exam" }).click();

  // Answer: right, a short answer, wrong.
  const questions = page.getByRole("navigation", { name: "Questions" });
  await expect(questions).toBeVisible();
  await expect(page.getByText("Question 1 of 3", { exact: false })).toBeVisible();
  // Each question as it comes: real models may write the types in another order.
  const answer = async (wrong) => {
    const box = page.getByLabel("Your answer");
    if (await box.isVisible()) {
      await box.fill("A tree splits the data by one attribute at each node.");
    } else if (mocked) {
      await page.getByRole("checkbox", { name: wrong ? /never used in practice/ : /a core idea of/ }).check();
    } else {
      await page.getByRole("checkbox").first().check();
    }
  };
  await answer(false);
  await page.getByRole("button", { name: "Next" }).click();
  await answer(false);
  await page.getByRole("button", { name: "Next" }).click();
  await answer(true);
  await expect(page.getByText("3 of 3 answered")).toBeVisible();

  // Review and submit.
  await page.getByRole("button", { name: "Finish" }).click();
  const review = page.getByRole("region", { name: "Review your answers" });
  await expect(review.getByText("All 3 questions are answered.")).toBeVisible();
  await review.getByRole("button", { name: "Submit and check" }).click();
  await page.getByRole("dialog", { name: "Submit your exam?" }).getByRole("button", { name: "Submit and check" }).click();

  // Results: one right, one partly right, one wrong.
  await expect(page.getByRole("heading", { name: "Your answers are checked" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  if (mocked) {
    const verdicts = page.getByRole("list", { name: "Answers by verdict" });
    await expect(verdicts).toContainText("1 correct");
    await expect(verdicts).toContainText("1 partly correct");
    await expect(verdicts).toContainText("1 wrong");
  }

  // Ask about an answer that wasn't right: the chat answers, then back to the results.
  await page.getByRole("button", { name: mocked ? "Ask about this: question 3" : /^Ask about this: question/ }).first().click();
  if (mocked) await expect(page.getByText("Mock answer: this is explained on the cited page.")).toBeVisible();
  else await expect(page.locator(".chat-msg--assistant:not(.chat-msg--thinking)").first()).toBeVisible();
  await page.getByRole("link", { name: "Back to exam results" }).click();
  await expect(page.getByRole("heading", { name: "Your answers are checked" })).toBeVisible();
});
