import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";
import { examFixture, installExamBackend, KI02, QUESTIONS } from "../../test/examBackend.js";

/*
  Answering an exam with the keyboard, over the real app routes: 1 to 9 toggle choices,
  ← / → move, Enter on the last question opens the review; typing a short answer is never
  interrupted; modifier keys are left alone; the "Keyboard shortcuts" list (English and German).
*/

let api;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const STORAGE = (examId) => `lectra:exam:v1:user-1:${examId}`;
const saved = () => JSON.parse(localStorage.getItem(STORAGE("e-ready")) ?? "{}");
const heading = (n) => screen.getByRole("heading", { name: QUESTIONS[n - 1].question });

async function openReady({ language } = {}) {
  installChatBackend(api, { lectures: [KI02], sessions: [{ id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id], updated_at: daysAgo(0) }] });
  installExamBackend(api, { exams: [examFixture("e-ready")] });
  if (language) localStorage.setItem("lectra:language:v1:user-1", language);
  const user = userEvent.setup();
  renderApp("/workspace/exam?chat=s-hunt&exam=e-ready");
  await screen.findByRole("navigation", { name: language === "de" ? "Fragen" : "Questions" });
  return user;
}

describe("exam keyboard shortcuts", () => {
  it("answers the whole exam with the keyboard", async () => {
    const user = await openReady();
    expect(document.activeElement).toBe(document.body);

    await user.keyboard("2");
    await user.keyboard("4");
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /lowers the impurity/ })).toBeChecked();
    expect(screen.getByText("Choice D selected")).toBeInTheDocument();
    await user.keyboard("2");
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).not.toBeChecked();
    expect(screen.getByText("Choice B cleared")).toBeInTheDocument();
    await user.keyboard("9"); // there is no 9th choice
    expect(saved().answers).toEqual({ q1: ["d"] });

    await user.keyboard("{ArrowRight}");
    expect(heading(2)).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(heading(1)).toHaveFocus();
    await user.keyboard("{Enter}"); // not the last question: nothing happens
    expect(screen.queryByRole("region", { name: "Review your answers" })).not.toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    const box = screen.getByLabelText("Your answer");
    await user.click(box);
    await user.keyboard("Split 1 vs 2, then 3{ArrowLeft}{ArrowRight}{Enter}more");
    expect(box).toHaveValue("Split 1 vs 2, then 3\nmore");
    expect(heading(2)).toBeInTheDocument(); // typing never moved on

    await user.tab({ shift: true }); // out of the text box
    await user.keyboard("{ArrowRight}");
    expect(heading(3)).toHaveFocus();
    await user.keyboard("{ArrowRight}"); // the last question: nowhere to go
    expect(heading(3)).toBeInTheDocument();
    await user.keyboard("1");
    expect(screen.getByRole("checkbox", { name: "0" })).toBeChecked();

    await user.keyboard("{Enter}");
    const review = await screen.findByRole("region", { name: "Review your answers" });
    expect(within(review).getByText("All 3 questions are answered.")).toBeInTheDocument();
    // In the review, the keys do nothing.
    await user.keyboard("{ArrowLeft}2");
    expect(screen.getByRole("region", { name: "Review your answers" })).toBeInTheDocument();
    expect(saved().answers).toEqual({ q1: ["d"], q2: "Split 1 vs 2, then 3\nmore", q3: ["a"] });
  });

  it("leaves keys with a modifier and Enter on a button alone", async () => {
    const user = await openReady();
    await user.keyboard("{Control>}2{/Control}{Alt>}{ArrowRight}{/Alt}{Shift>}1{/Shift}");
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).not.toBeChecked();
    expect(heading(1)).toBeInTheDocument();

    // Enter on Next is Next itself, once.
    screen.getByRole("button", { name: "Next" }).focus();
    await user.keyboard("{Enter}");
    expect(heading(2)).toBeInTheDocument();
  });

  it("works with the focus on a choice", async () => {
    const user = await openReady();
    await user.click(screen.getByRole("checkbox", { name: /random attribute/ }));
    expect(screen.getByRole("checkbox", { name: /random attribute/ })).toHaveFocus();
    await user.keyboard("1{ArrowRight}");
    expect(saved().answers).toEqual({ q1: ["a", "c"] });
    expect(heading(2)).toHaveFocus();
  });

  it("lists the shortcuts behind a button", async () => {
    const user = await openReady();
    const toggle = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Previous / next question")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Select or clear choice A to I")).toBeInTheDocument();
    expect(screen.getByText("Previous / next question")).toBeInTheDocument();
    expect(screen.getByText("On the last question: review your answers")).toBeInTheDocument();
    expect(screen.getByText("Off while you type an answer.")).toBeInTheDocument();
    // Enter on the open toggle closes it again rather than finishing anything.
    await user.keyboard("{Enter}");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  });

  it("is in German too", async () => {
    const user = await openReady({ language: "de" });
    await user.click(screen.getByRole("button", { name: "Tastenkürzel" }));
    expect(screen.getByText("Vorherige / nächste Frage")).toBeInTheDocument();
    await user.keyboard("3");
    expect(screen.getByText("Antwort C ausgewählt")).toBeInTheDocument();
  });
});
