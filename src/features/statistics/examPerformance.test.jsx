import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setCurrentLanguage } from "../../i18n/i18n.js";
import { makeToken, mockApi, ok, renderApp, saveToken } from "../../test/helpers.jsx";
import { installChatBackend } from "../../test/chatBackend.js";
import { installExamBackend, KI02, KI03, submittedExam } from "../../test/examBackend.js";
import { formatExamDate } from "../exam/examFormat.js";
import { lastWeeksFrom, practiceLectureIds, weekLabel } from "./examStatsText.js";

/*
  Statistics → Exam performance, against a mocked GET /api/stats/exams over the real app
  routes: every part with realistic data (summary, weekly chart with its text alternative and
  table, per lecture, per question type, weakest concepts, history), "Practice this" into the
  exam setup (deleted lectures left out), a history row into the exam's results, a score
  still waiting for a grade, a chart with one week, the period, loading / error / empty, and
  German.
*/

const NOW = new Date("2026-11-16T12:00:00Z");

const STATS = {
  exams_submitted: 4,
  exams_scored: 3,
  average_percent: 61,
  best_percent: 100,
  history: [
    { exam_id: "e4", title: KI02.title, submitted_at: "2026-11-16T09:12:00+00:00", lectures: [{ lecture_id: KI02.id, title: KI02.title }], question_count: 3, score_percent: null },
    {
      exam_id: "e-done",
      title: KI02.title,
      submitted_at: "2026-11-12T14:05:00+00:00",
      lectures: [
        { lecture_id: KI02.id, title: KI02.title },
        { lecture_id: KI03.id, title: KI03.title },
      ],
      question_count: 5,
      score_percent: 100,
    },
    { exam_id: "e2", title: KI03.title, submitted_at: "2026-11-10T10:30:00+00:00", lectures: [{ lecture_id: KI03.id, title: KI03.title }], question_count: 3, score_percent: 50 },
    { exam_id: "e1", title: "Entropy", submitted_at: "2026-11-03T16:00:00+00:00", lectures: [{ lecture_id: null, title: "Entropy" }], question_count: 3, score_percent: 33 },
  ],
  by_week: [
    { week_start: "2026-11-02", exams: 1, average_percent: 33 },
    { week_start: "2026-11-09", exams: 2, average_percent: 75 },
  ],
  by_lecture: [
    { lecture_id: null, title: "Entropy", exams: 1, average_percent: 33, best_percent: 33 },
    { lecture_id: KI03.id, title: KI03.title, exams: 2, average_percent: 75, best_percent: 100 },
    { lecture_id: KI02.id, title: KI02.title, exams: 1, average_percent: 100, best_percent: 100 },
  ],
  by_type: [
    { type: "multiple_choice", questions: 8, correct: 5, correct_percent: 63, points_percent: 70 },
    { type: "short_answer", questions: 6, correct: 2, correct_percent: 33, points_percent: 52 },
  ],
  weakest_concepts: [
    { concept: "entropy", questions: 3, correct: 0, correct_percent: 0, lecture_ids: [] },
    { concept: "gini index", questions: 6, correct: 2, correct_percent: 33, lecture_ids: [KI02.id, "l-gone"] },
    { concept: "decision tree", questions: 4, correct: 3, correct_percent: 75, lecture_ids: [KI03.id] },
  ],
};

const EMPTY = {
  exams_submitted: 0,
  exams_scored: 0,
  average_percent: null,
  best_percent: null,
  history: [],
  by_week: [],
  by_lecture: [],
  by_type: [],
  weakest_concepts: [],
};

const OVERVIEW = {
  lectures: 2,
  pages_read: 30,
  pages_total: 105,
  chats: 1,
  questions_asked: 2,
  exams_taken: 4,
  questions_answered: 14,
  average_score_percent: 61,
  correct_percent: 50,
  study_days: 3,
  current_streak: 1,
  last_activity_at: "2026-11-16T09:12:00+00:00",
};

let api;
let exams;

function setup(stats = STATS) {
  installChatBackend(api, { lectures: [KI02, KI03] });
  exams = installExamBackend(api, { exams: [submittedExam()] });
  api.onGet("/stats/overview").reply(200, ok(OVERVIEW));
  api.onGet("/stats/completion").reply(200, ok({ lectures: [], overall_percent: 0, weights: { reading: 70, exam: 30 } }));
  if (stats) api.onGet("/stats/exams").reply(200, ok(stats));
}

async function openSection(name = "Exam performance") {
  const user = userEvent.setup();
  const result = renderApp("/statistics");
  const section = await screen.findByRole("region", { name });
  return { user, section, ...result };
}

const part = (section, name) => within(section).getByRole("region", { name });
const texts = (list) => within(list).getAllByRole("listitem").map((item) => item.textContent.replace(/\s+/g, " ").trim());
const examRequests = () => api.history.get.filter((request) => request.url === "/stats/exams");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

afterEach(() => {
  api.restore();
  vi.useRealTimers();
});

describe("exam performance on the Statistics page", () => {
  it("sits between the overall cards and the course completion", async () => {
    setup();
    await openSection();
    const headings = (await screen.findAllByRole("heading", { level: 2 })).map((heading) => heading.textContent);
    expect(headings.indexOf("Exam performance")).toBe(headings.indexOf("Overall") + 1);
    expect(headings.indexOf("Course completion")).toBe(headings.indexOf("Exam performance") + 1);
  });

  it("shows the summary and the average per week, readable without hover and as a table", async () => {
    setup();
    const { user, section } = await openSection();

    expect(await within(section).findByTestId("exam-summary")).toHaveTextContent("4 exams · average 61% · best 100% · 1 waiting for a grade");

    const chart = part(section, "Average score per week");
    const svg = within(chart).getByRole("img");
    expect(svg).toHaveAccessibleName("Average score per week: week of 2 Nov: 33%, week of 9 Nov: 75%");
    // Values and weeks are written on the chart.
    const written = [...svg.querySelectorAll("text")].map((text) => text.textContent);
    expect(written).toEqual(expect.arrayContaining(["33%", "75%", "2 Nov", "9 Nov"]));
    expect(svg.querySelector(".chart__line")).not.toBeNull();
    expect(within(chart).queryByText(/One week so far/)).not.toBeInTheDocument();

    await user.click(within(chart).getByText("Show as a table"));
    const table = within(chart).getByRole("table");
    const rows = within(table)
      .getAllByRole("row")
      .map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Week starting", "Exams", "Average"],
      ["2 Nov", "1", "33%"],
      ["9 Nov", "2", "75%"],
    ]);
  });

  it("lists the lectures lowest average first, and the question types", async () => {
    setup();
    const { section } = await openSection();

    const lectures = await waitFor(() => part(section, "Per lecture"));
    expect(texts(within(lectures).getByRole("list"))).toEqual([
      "Entropydeleted33%Average 33%Best 33%1 exam",
      `${KI03.title}75%Average 75%Best 100%2 exams`,
      `${KI02.title}100%Average 100%Best 100%1 exam`,
    ]);
    expect(within(lectures).getByRole("meter", { name: `Average score in ${KI03.title}` })).toHaveAttribute("aria-valuenow", "75");

    const types = part(section, "Per question type");
    expect(texts(within(types).getByRole("list"))).toEqual(["Multiple choice63%5 of 8 correct70% of the points", "Short answer33%2 of 6 correct52% of the points"]);
    expect(within(types).getByRole("meter", { name: "Correct answers in Short answer" })).toHaveAttribute("aria-valuenow", "33");
  });

  it("lists the weakest concepts, with Practice this only where a lecture is left", async () => {
    setup();
    const { section } = await openSection();
    const concepts = await waitFor(() => part(section, "Weakest concepts"));
    const items = within(concepts).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector(".exam-stats__concept-text").textContent)).toEqual([
      "entropy0 of 3 correct · 0%",
      "gini index2 of 6 correct · 33%",
      "decision tree3 of 4 correct · 75%",
    ]);
    // The entropy lecture was deleted: nothing to practise on.
    expect(within(items[0]).queryByRole("button")).not.toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "Practice this: gini index" })).toBeInTheDocument();
    expect(within(items[2]).getByRole("button", { name: "Practice this: decision tree" })).toBeInTheDocument();
  });

  it("Practice this opens the exam setup with the concept's lectures, leaving out deleted ones", async () => {
    setup();
    const { user, section, router } = await openSection();
    await user.click(await within(section).findByRole("button", { name: "Practice this: gini index" }));

    expect(await screen.findByRole("heading", { name: "New exam" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/workspace/exam");
    expect(router.state.location.state).toEqual({ examPreset: { lectureIds: [KI02.id], concept: "gini index" } });
    expect(screen.getByText("The materials “gini index” came from are chosen. Change them if you like.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /KI 02/ })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /KI 03/ })).not.toBeChecked();
    expect(screen.queryByText(/were deleted|was deleted/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate exam" }));
    expect(exams.started).toEqual([{ lecture_ids: [KI02.id], question_count: 5, types: ["multiple_choice", "short_answer"] }]);
  });

  it("shows the history newest first, with a score waiting for a grade", async () => {
    setup();
    const { section } = await openSection();
    const history = await waitFor(() => part(section, "History"));
    const table = within(history).getByRole("table", { name: /Your submitted exams, newest first/ });
    const rows = within(table)
      .getAllByRole("row")
      .map((row) => [...row.children].map((cell) => cell.textContent.replace(" (open the results)", "")));
    expect(rows).toEqual([
      ["Date", "Score", "Questions", "Materials"],
      [formatExamDate("2026-11-16T09:12:00+00:00"), "Waiting for a grade", "3", KI02.title],
      [formatExamDate("2026-11-12T14:05:00+00:00"), "100%", "5", `${KI02.title}, ${KI03.title}`],
      [formatExamDate("2026-11-10T10:30:00+00:00"), "50%", "3", KI03.title],
      [formatExamDate("2026-11-03T16:00:00+00:00"), "33%", "3", "Entropy"],
    ]);
    // The table scrolls inside its own box, which a keyboard can reach.
    const box = table.parentElement;
    expect(box).toHaveClass("exam-stats__scroll");
    expect(box).toHaveAttribute("tabindex", "0");
    expect(within(table).getAllByRole("link")[1]).toHaveAttribute("href", "/workspace/exam?exam=e-done");
  });

  it("opens an exam's results from its history row", async () => {
    setup();
    const { user, section, router } = await openSection();
    const history = await waitFor(() => part(section, "History"));
    await user.click(within(history).getByText(`${KI02.title}, ${KI03.title}`));

    expect(await screen.findByRole("region", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/workspace/exam");
    expect(router.state.location.search).toBe("?exam=e-done");
  });

  it("shows ten exams at first, and the rest on request", async () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      ...STATS.history[2],
      exam_id: `e-${index}`,
      submitted_at: `2026-11-${String(15 - index).padStart(2, "0")}T10:00:00+00:00`,
    }));
    setup({ ...STATS, exams_submitted: 12, exams_scored: 12, history });
    const { user, section } = await openSection();
    const part_ = await waitFor(() => part(section, "History"));
    expect(within(part_).getAllByRole("row")).toHaveLength(11);
    await user.click(within(part_).getByRole("button", { name: "Show all 12 exams" }));
    expect(within(part_).getAllByRole("row")).toHaveLength(13);
    await user.click(within(part_).getByRole("button", { name: "Show fewer" }));
    expect(within(part_).getAllByRole("row")).toHaveLength(11);
  });

  it("draws a single week as one point with its value and week", async () => {
    setup({
      ...STATS,
      exams_submitted: 1,
      exams_scored: 1,
      average_percent: 67,
      best_percent: 67,
      history: [STATS.history[1]],
      by_week: [{ week_start: "2026-11-16", exams: 1, average_percent: 67 }],
      weakest_concepts: [],
    });
    const { section } = await openSection();
    const chart = await waitFor(() => part(section, "Average score per week"));
    const svg = within(chart).getByRole("img");
    expect(svg).toHaveAccessibleName("Average score per week: week of 16 Nov: 67%");
    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector(".chart__line")).toBeNull();
    const circle = svg.querySelector("circle");
    expect(Number(circle.getAttribute("cx"))).toBeGreaterThan(0);
    expect(Number.isFinite(Number(circle.getAttribute("cy")))).toBe(true);
    expect([...svg.querySelectorAll("text")].map((text) => text.textContent)).toEqual(expect.arrayContaining(["67%", "16 Nov"]));
    expect(within(chart).getByText("One week so far. Each week with a graded exam adds a point.")).toBeInTheDocument();
    expect(within(section).getByTestId("exam-summary")).toHaveTextContent("1 exam · average 67% · best 67%");
    // No concept asked twice yet: the part says when concepts appear.
    expect(within(part(section, "Weakest concepts")).getByText("A concept shows here once it was asked in at least 2 questions.")).toBeInTheDocument();
  });

  it("shows loading first, then an error with Try again that loads again", async () => {
    setup(null);
    let fail = true;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    api.onGet("/stats/exams").reply(async () => {
      await gate;
      return fail ? [500, { status: false, message: "Something went wrong", data: null }] : [200, ok(STATS)];
    });
    const { user, section } = await openSection();

    expect(section).toHaveAttribute("aria-busy", "true");
    expect(within(section).getByRole("status")).toHaveTextContent("Loading your exam performance…");
    release();

    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(within(section).queryByRole("group", { name: "Period" })).not.toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await within(section).findByTestId("exam-summary")).toHaveTextContent("4 exams");
    expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    expect(examRequests()).toHaveLength(2);
  });

  it("invites a student without a submitted exam to take one", async () => {
    setup(EMPTY);
    const { section } = await openSection();
    expect(await within(section).findByText("No exam submitted yet")).toBeInTheDocument();
    expect(within(section).getByText(/Take an exam on your materials/)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Take an exam" })).toHaveAttribute("href", "/workspace/exam");
    expect(within(section).queryByRole("link", { name: /Upload/ })).not.toBeInTheDocument();
    expect(within(section).queryByRole("group", { name: "Period" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("img")).not.toBeInTheDocument();
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });

  it("narrows everything to the last 4 weeks, and back", async () => {
    setup(null);
    api.onGet("/stats/exams").reply((config) => [200, ok(config.params?.from ? EMPTY : STATS)]);
    const { user, section } = await openSection();
    await within(section).findByTestId("exam-summary");
    expect(examRequests()[0].params).toEqual({});

    const period = within(section).getByRole("group", { name: "Period" });
    expect(within(period).getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(period).getByRole("button", { name: "Last 4 weeks" }));

    expect(await within(section).findByText("No exam submitted in the last 4 weeks")).toBeInTheDocument();
    expect(examRequests()[1].params).toEqual({ from: "2026-10-20" });
    expect(within(period).getByRole("button", { name: "Last 4 weeks" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(section).getByRole("button", { name: "Show all time" }));
    expect(await within(section).findByTestId("exam-summary")).toHaveTextContent("4 exams");
    expect(examRequests()).toHaveLength(3);
  });

  it("is in German when the student chose German", async () => {
    localStorage.setItem("lectra:language:v1:user-1", "de");
    setup();
    const { section } = await openSection("Prüfungsergebnisse");
    expect(await within(section).findByTestId("exam-summary")).toHaveTextContent("4 Prüfungen · Durchschnitt 61 % · Bestwert 100 % · 1 wartet auf die Bewertung");
    expect(within(part(section, "Durchschnittsergebnis pro Woche")).getByRole("img")).toHaveAccessibleName(
      "Durchschnittsergebnis pro Woche: Woche ab 2. Nov.: 33 %, Woche ab 9. Nov.: 75 %"
    );
    expect(texts(within(part(section, "Pro Fragetyp")).getByRole("list"))[0]).toBe("Multiple Choice63 %5 von 8 richtig70 % der Punkte");
    expect(within(part(section, "Schwächste Konzepte")).getByRole("button", { name: "Üben: gini index" })).toBeInTheDocument();
    const history = part(section, "Verlauf");
    expect(within(history).getByText("Wartet auf Bewertung")).toBeInTheDocument();
    expect(within(history).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Datum", "Ergebnis", "Fragen", "Materialien"]);
    expect(within(part(section, "Pro Vorlesung")).getByText("gelöscht")).toBeInTheDocument();
    expect(within(section).getByRole("group", { name: "Zeitraum" })).toBeInTheDocument();
  });
});

describe("exam performance helpers", () => {
  beforeEach(() => setCurrentLanguage("en"));
  afterEach(() => setCurrentLanguage("en"));

  it("labels weeks readably, with the year only when it isn't this year", () => {
    expect(weekLabel("2026-11-09", NOW)).toBe("9 Nov");
    expect(weekLabel("2025-12-29", NOW)).toBe("29 Dec 2025");
    setCurrentLanguage("de");
    expect(weekLabel("2026-11-09", NOW)).toBe("9. Nov.");
  });

  it("starts the last 4 weeks 27 UTC days before today", () => {
    expect(lastWeeksFrom(4, NOW)).toBe("2026-10-20");
    expect(lastWeeksFrom(4, new Date("2026-03-01T23:30:00-05:00"))).toBe("2026-02-03");
  });

  it("keeps only the lectures that still exist for Practice this", () => {
    const concept = { lecture_ids: [KI02.id, "l-gone", KI02.id, KI03.id] };
    expect(practiceLectureIds(concept, STATS)).toEqual([KI02.id, KI03.id]);
    expect(practiceLectureIds({ lecture_ids: ["l-gone"] }, STATS)).toEqual([]);
    expect(practiceLectureIds({ lecture_ids: [KI03.id] }, { history: [], by_lecture: [{ lecture_id: KI03.id }] })).toEqual([KI03.id]);
    expect(practiceLectureIds({}, STATS)).toEqual([]);
  });
});
