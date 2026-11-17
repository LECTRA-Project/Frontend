import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  Statistics → Course completion, against a mocked GET /api/stats/completion: one row per
  lecture in the backend's order, the units per type, the overall value, the help text with
  the backend's weights, and the loading, error and empty states.
*/
const token = makeToken();

const row = (id, title, fields) => ({
  lecture_id: id,
  title,
  source_type: "page",
  viewed: 0,
  total: 10,
  reading_percent: 0,
  best_exam_percent: null,
  completion_percent: 0,
  ...fields,
});

// The backend's order (least complete first). The titles are not alphabetical, so a
// re-sort by title would show.
const COMPLETION = {
  lectures: [
    row("img-0", "Whiteboard photo", { source_type: null, viewed: 0, total: 1 }),
    row("nb", "Pandas basics", { source_type: "cell", viewed: 0, total: 1, completion_percent: 15, best_exam_percent: 50 }),
    row("deck", "Game playing", { source_type: "slide", viewed: 3, total: 12, reading_percent: 25, completion_percent: 18 }),
    row("ki", "KI 02 Classification", { viewed: 52, total: 65, reading_percent: 80, best_exam_percent: 75, completion_percent: 79 }),
    row("img-1", "Decision tree sketch", { source_type: null, viewed: 1, total: 1, reading_percent: 100, completion_percent: 70 }),
  ],
  overall_percent: 58,
  weights: { reading: 60, exam: 40 }, // not the default 70/30: the text must come from here
};

// The rows of the list (its label is translated, so it is found by its class here).
const rows = () => within(document.querySelector(".completion__list")).getAllByRole("listitem");
const rowOf = (title) => rows().find((item) => within(item).queryByText(title));

describe("course completion on the Statistics page", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    api.onGet("/users/me").reply(200, ok(TEST_USER));
    // The overview cards above it (tested in overviewCards.test.jsx).
    api.onGet("/stats/overview").reply(200, ok({ lectures: 0, pages_read: 0, pages_total: 0, chats: 0, questions_asked: 0, exams_taken: 0, questions_answered: 0, average_score_percent: null, correct_percent: null, study_days: 0, current_streak: 0, last_activity_at: null }));
    saveToken(token);
  });

  afterEach(() => api.restore());

  it("lists every lecture in the backend's order with its numbers", async () => {
    api.onGet("/stats/completion").reply(200, ok(COMPLETION));
    renderApp("/statistics");

    const section = await screen.findByRole("region", { name: "Course completion" });
    await within(section).findByRole("list", { name: "Lectures, least complete first" });

    // Order kept, and the completion bar of each row.
    expect(rows().map((item) => item.querySelector(".completion__title").textContent)).toEqual([
      "Whiteboard photo",
      "Pandas basics",
      "Game playing",
      "KI 02 Classification",
      "Decision tree sketch",
    ]);
    const ki = rowOf("KI 02 Classification");
    const bar = within(ki).getByRole("meter", { name: "Completion of KI 02 Classification" });
    expect(bar).toHaveAttribute("aria-valuenow", "79");
    expect(bar).toHaveAttribute("aria-valuetext", "79% complete");
    expect(ki).toHaveTextContent("79%");

    // Pages read in the lecture's own unit, the reading % and the best exam %.
    expect(ki).toHaveTextContent("52 of 65 pages");
    expect(ki).toHaveTextContent("80% read");
    expect(ki).toHaveTextContent("Best exam 75%");
    expect(rowOf("Game playing")).toHaveTextContent("3 of 12 slides");
    expect(rowOf("Pandas basics")).toHaveTextContent("0 of 1 cell");
    expect(rowOf("Pandas basics")).toHaveTextContent("Best exam 50%");

    // An image is opened or not.
    expect(rowOf("Decision tree sketch")).toHaveTextContent("Opened");
    expect(rowOf("Whiteboard photo")).toHaveTextContent("Not opened");

    // No graded exam: a dash, read out as "no graded exam yet".
    const deck = rowOf("Game playing");
    expect(within(deck).getByText("—")).toHaveAttribute("aria-hidden", "true");
    expect(within(deck).getByText("no graded exam yet")).toHaveClass("visually-hidden");

    // The overall value in the header.
    expect(within(section).getByTestId("completion-overall")).toHaveTextContent("58%overall");
  });

  it("explains the calculation with the backend's weights, by keyboard and by tap", async () => {
    api.onGet("/stats/completion").reply(200, ok(COMPLETION));
    const user = userEvent.setup();
    renderApp("/statistics");

    const toggle = await screen.findByRole("button", { name: "How is completion calculated?" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const formula = screen.getByText("Completion = 60% pages read + 40% best exam score");
    expect(formula).not.toBeVisible();

    // Keyboard: Tab to the button, Enter opens, Space closes.
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(formula).toBeVisible();
    expect(document.getElementById(toggle.getAttribute("aria-controls"))).toContainElement(formula);
    expect(screen.getByText(/kept on screen in the viewer for 2 seconds/)).toBeVisible();
    await user.keyboard(" ");
    expect(formula).not.toBeVisible();

    // A click (or a tap) opens it too.
    await user.click(toggle);
    expect(formula).toBeVisible();
  });

  it("shows loading first, then an error with Try again that loads again", async () => {
    let fail = true;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    api.onGet("/stats/completion").reply(async () => {
      await gate;
      return fail ? [500, { status: false, message: "Something went wrong", data: null }] : [200, ok(COMPLETION)];
    });
    const user = userEvent.setup();
    renderApp("/statistics");

    const section = await screen.findByRole("region", { name: "Course completion" });
    expect(within(section).getByRole("status")).toHaveTextContent("Loading your course completion…");
    expect(within(section).queryByRole("button", { name: "How is completion calculated?" })).not.toBeInTheDocument();
    release();

    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await within(section).findByRole("list", { name: "Lectures, least complete first" });
    expect(rows()).toHaveLength(5);
    expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    // The section's two requests, and the project picker's one (its list of projects).
    expect(api.history.get.filter((request) => request.url === "/stats/completion")).toHaveLength(3);
  });

  it("tells a new student how to start", async () => {
    api.onGet("/stats/completion").reply(200, ok({ lectures: [], overall_percent: 0, weights: { reading: 70, exam: 30 } }));
    renderApp("/statistics");

    const section = await screen.findByRole("region", { name: "Course completion" });
    expect(await within(section).findByText("Upload a lecture and read it to see your progress.")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Upload a lecture" })).toHaveAttribute("href", "/workspace");
    expect(within(section).queryByTestId("completion-overall")).not.toBeInTheDocument();
    expect(within(section).queryByRole("list")).not.toBeInTheDocument();
  });

  it("is in German when the student chose German", async () => {
    localStorage.setItem(`lectra:language:v1:${TEST_USER.id}`, "de");
    api.onGet("/stats/completion").reply(200, ok(COMPLETION));
    renderApp("/statistics");

    const section = await screen.findByRole("region", { name: "Kursfortschritt" });
    expect(await within(section).findByRole("list", { name: "Vorlesungen, die am wenigsten fortgeschrittene zuerst" })).toBeInTheDocument();
    expect(rowOf("KI 02 Classification")).toHaveTextContent("52 von 65 Seiten");
    expect(rowOf("KI 02 Classification")).toHaveTextContent("79 %");
    expect(within(section).getByText("Fortschritt = 60 % gelesene Seiten + 40 % bestes Prüfungsergebnis")).toBeInTheDocument();
  });
});
