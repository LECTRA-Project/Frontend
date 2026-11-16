import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setCurrentLanguage } from "../../i18n/i18n.js";
import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";
import { isNewStudent, lastActivityText, pagesTotalText, streakText } from "./overviewText.js";

/*
  Statistics → Overall, against a mocked GET /api/stats/overview: the five cards with their
  values and second lines, real zeros and "—", the streak and last-activity wording, the
  loading, error and new-student states, and a page without sample data.
*/
const token = makeToken();
const HOUR = 3600000;

const OVERVIEW = {
  lectures: 3,
  pages_read: 214,
  pages_total: 340,
  chats: 14,
  questions_asked: 87,
  exams_taken: 12,
  questions_answered: 58,
  average_score_percent: 68,
  correct_percent: 61,
  study_days: 9,
  current_streak: 5,
  last_activity_at: new Date().toISOString(),
};

const NEW_STUDENT = {
  lectures: 0,
  pages_read: 0,
  pages_total: 0,
  chats: 0,
  questions_asked: 0,
  exams_taken: 0,
  questions_answered: 0,
  average_score_percent: null,
  correct_percent: null,
  study_days: 0,
  current_streak: 0,
  last_activity_at: null,
};

const COMPLETION = { lectures: [], overall_percent: 0, weights: { reading: 70, exam: 30 } };

async function overviewSection() {
  return screen.findByRole("region", { name: "Overall" });
}

/* The card with this label: { value, note } as text. */
function card(section, label) {
  const term = within(section).getByText(label, { selector: "dt" });
  const [value, note] = term.parentElement.querySelectorAll("dd");
  return { value: value.textContent, note: note.textContent, element: term.parentElement };
}

describe("overview cards on the Statistics page", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    api.onGet("/users/me").reply(200, ok(TEST_USER));
    api.onGet("/stats/completion").reply(200, ok(COMPLETION));
    saveToken(token);
  });

  afterEach(() => api.restore());

  it("shows the five numbers with their second lines", async () => {
    api.onGet("/stats/overview").reply(200, ok(OVERVIEW));
    renderApp("/statistics");

    const section = await overviewSection();
    await within(section).findByText("Exams taken");
    const labels = [...section.querySelectorAll("dt")].map((term) => term.textContent);
    expect(labels).toEqual(["Exams taken", "Average score", "Pages read", "Study streak", "Questions asked"]);

    expect(card(section, "Exams taken")).toMatchObject({ value: "12", note: "58 questions answered" });
    expect(card(section, "Average score")).toMatchObject({ value: "68%", note: "61% of answers correct" });
    expect(card(section, "Pages read")).toMatchObject({ value: "214", note: "of 340 pages in your materials" });
    expect(card(section, "Study streak")).toMatchObject({ value: "5 days", note: "Last activity today" });
    expect(card(section, "Questions asked")).toMatchObject({ value: "87", note: "in 14 chats" });
    expect(api.history.get.filter((request) => request.url === "/stats/overview")).toHaveLength(1);
  });

  it("shows real zeros once something was done, and a dash without a graded exam", async () => {
    api.onGet("/stats/overview").reply(
      200,
      ok({
        ...NEW_STUDENT,
        lectures: 1,
        pages_total: 12,
        chats: 1,
        study_days: 1,
        current_streak: 1,
        last_activity_at: new Date(Date.now() - 24 * HOUR).toISOString(),
      })
    );
    renderApp("/statistics");

    const section = await overviewSection();
    await within(section).findByText("Exams taken");
    expect(card(section, "Exams taken")).toMatchObject({ value: "0", note: "No exam submitted yet" });
    expect(card(section, "Pages read")).toMatchObject({ value: "0", note: "of 12 pages in your materials" });
    expect(card(section, "Study streak")).toMatchObject({ value: "1 day", note: "Last activity yesterday" });
    expect(card(section, "Questions asked")).toMatchObject({ value: "0", note: "in 1 chat" });

    // No average yet: a dash, read out as "no score yet".
    const average = card(section, "Average score");
    expect(average.note).toBe("No graded exam yet");
    expect(within(average.element).getByText("—")).toHaveAttribute("aria-hidden", "true");
    expect(within(average.element).getByText("no score yet")).toHaveClass("visually-hidden");
    expect(screen.queryByText("Your numbers will show here")).not.toBeInTheDocument();
  });

  it("names the day of the last activity when the streak has ended", async () => {
    const lastActivity = new Date(Date.now() - 5 * 24 * HOUR);
    api.onGet("/stats/overview").reply(
      200,
      ok({ ...OVERVIEW, current_streak: 0, chats: 0, questions_asked: 0, last_activity_at: lastActivity.toISOString() })
    );
    renderApp("/statistics");

    const section = await overviewSection();
    await within(section).findByText("Study streak");
    const date = lastActivity.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    expect(card(section, "Study streak")).toMatchObject({ value: "0 days", note: `Last activity on ${date}` });
    expect(card(section, "Questions asked")).toMatchObject({ value: "0", note: "No chats yet" });
  });

  it("shows loading first, then an error with Try again that loads again", async () => {
    let fail = true;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    api.onGet("/stats/overview").reply(async () => {
      await gate;
      return fail ? [500, { status: false, message: "Something went wrong", data: null }] : [200, ok(OVERVIEW)];
    });
    const user = userEvent.setup();
    renderApp("/statistics");

    const section = await overviewSection();
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(within(section).getByRole("status")).toHaveTextContent("Loading your overall numbers…");
    expect(section.querySelector("dl")).toBeNull();
    release();

    const alert = await within(section).findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    await within(section).findByText("Exams taken", { selector: "dt" });
    expect(card(section, "Exams taken").value).toBe("12");
    expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
    expect(api.history.get.filter((request) => request.url === "/stats/overview")).toHaveLength(2);
  });

  it("shows a new student how to start instead of a row of zeros", async () => {
    api.onGet("/stats/overview").reply(200, ok(NEW_STUDENT));
    renderApp("/statistics");

    const section = await overviewSection();
    expect(await within(section).findByText("Your numbers will show here")).toBeInTheDocument();
    const steps = within(section).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining("Step 1: Upload a lecture"),
      expect.stringContaining("Step 2: Read it"),
      expect.stringContaining("Step 3: Take an exam"),
    ]);
    expect(steps[1]).toHaveTextContent("A page counts once it has been on screen for 2 seconds.");
    expect(within(steps[0]).getByRole("link", { name: "Upload a lecture" })).toHaveAttribute("href", "/workspace");
    expect(within(section).queryByText("Exams taken")).not.toBeInTheDocument();
    expect(section.querySelector("dl")).toBeNull();
  });

  it("shows only real numbers: no sample data on the page", async () => {
    api.onGet("/stats/overview").reply(200, ok(OVERVIEW));
    renderApp("/statistics");

    await overviewSection();
    await screen.findByText("Exams taken");
    await screen.findByRole("region", { name: "Course completion" });
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/illustrative/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/demo placeholders/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Overall performance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /sample scores/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sample/i);
  });

  it("is in German when the student chose German", async () => {
    localStorage.setItem(`lectra:language:v1:${TEST_USER.id}`, "de");
    api.onGet("/stats/overview").reply(200, ok({ ...OVERVIEW, pages_read: 1214, pages_total: 1340 }));
    renderApp("/statistics");

    const section = await screen.findByRole("region", { name: "Überblick" });
    await within(section).findByText("Abgelegte Prüfungen");
    expect(card(section, "Abgelegte Prüfungen")).toMatchObject({ value: "12", note: "58 Fragen beantwortet" });
    expect(card(section, "Durchschnittsergebnis")).toMatchObject({ value: "68 %", note: "61 % der Antworten richtig" });
    expect(card(section, "Gelesene Seiten")).toMatchObject({ value: "1.214", note: "von 1.340 Seiten in deinen Materialien" });
    expect(card(section, "Lernserie")).toMatchObject({ value: "5 Tage", note: "Zuletzt aktiv: heute" });
    expect(card(section, "Gestellte Fragen")).toMatchObject({ value: "87", note: "in 14 Chats" });
  });
});

describe("overview texts", () => {
  beforeEach(() => setCurrentLanguage("en"));
  afterEach(() => setCurrentLanguage("en"));

  const NOW = new Date("2026-11-16T09:30:00Z");

  it("words the last activity in UTC days, like the streak", () => {
    expect(lastActivityText("2026-11-16T00:05:00+00:00", NOW)).toBe("Last activity today");
    expect(lastActivityText("2026-11-15T23:55:00+00:00", NOW)).toBe("Last activity yesterday");
    // 00:30 in Berlin on the 16th is still the 15th in UTC.
    expect(lastActivityText("2026-11-16T00:30:00+01:00", NOW)).toBe("Last activity yesterday");
    expect(lastActivityText("2026-11-12T18:00:00+00:00", NOW)).toBe("Last activity on 12 Nov");
    expect(lastActivityText("2025-12-30T18:00:00+00:00", NOW)).toBe("Last activity on 30 Dec 2025");
    // A clock a little ahead of the device's: still today.
    expect(lastActivityText("2026-11-16T09:31:00+00:00", NOW)).toBe("Last activity today");
    expect(lastActivityText(null, NOW)).toBe("No activity yet");
    expect(lastActivityText("not a date", NOW)).toBe("No activity yet");

    setCurrentLanguage("de");
    expect(lastActivityText("2026-11-15T12:00:00+00:00", NOW)).toBe("Zuletzt aktiv: gestern");
    expect(lastActivityText("2026-11-12T18:00:00+00:00", NOW)).toBe("Zuletzt aktiv am 12. Nov.");
  });

  it("counts the streak in days, and the pages of the materials", () => {
    expect(streakText(0)).toBe("0 days");
    expect(streakText(1)).toBe("1 day");
    expect(streakText(12)).toBe("12 days");
    expect(pagesTotalText(0)).toBe("No pages to read yet");
    expect(pagesTotalText(1)).toBe("of 1 page in your materials");
    setCurrentLanguage("de");
    expect(streakText(1)).toBe("1 Tag");
    expect(streakText(3)).toBe("3 Tage");
  });

  it("knows a new student: no lectures and nothing done", () => {
    expect(isNewStudent(NEW_STUDENT)).toBe(true);
    expect(isNewStudent({ ...NEW_STUDENT, chats: 1 })).toBe(false);
    expect(isNewStudent({ ...NEW_STUDENT, study_days: 1, last_activity_at: "2026-11-01T10:00:00+00:00" })).toBe(false);
    expect(isNewStudent({ ...NEW_STUDENT, exams_taken: 1 })).toBe(false);
    expect(isNewStudent(null)).toBe(false);
  });
});
