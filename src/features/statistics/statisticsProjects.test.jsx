import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  Statistics per project: the project picker (All projects / each project with its
  completion), the choice in the URL (?project=), every section asking for that project,
  a project that isn't there any more, no picker without projects, German.
*/
const ML = { project_id: "p-ml", name: "Machine Learning", lectures: 2, overall_percent: 42 };
const EMPTY_PROJECT = { project_id: "p-empty", name: "Empty", lectures: 0, overall_percent: 0 };

const overview = (lectures) => ({
  lectures, pages_read: 3, pages_total: 10, chats: 1, questions_asked: 2, exams_taken: 0, questions_answered: 0,
  average_score_percent: null, correct_percent: null, study_days: 1, current_streak: 1,
  last_activity_at: new Date().toISOString(),
});
const EXAMS = { exams_submitted: 0, exams_scored: 0, average_percent: null, best_percent: null, history: [], by_week: [], by_lecture: [], by_type: [], weakest_concepts: [] };
const completion = (projects, project = null) => ({
  lectures: [], overall_percent: project ? 42 : 30, weights: { reading: 70, exam: 30 }, project, projects,
});

let api;
const search = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search));
const requests = (url) => api.history.get.filter((request) => request.url === url);

function install({ projects = [ML, EMPTY_PROJECT] } = {}) {
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/stats/overview").reply((config) => [200, ok(overview(config.params?.project_id ? 2 : 5))]);
  api.onGet("/stats/exams").reply(200, ok(EXAMS));
  api.onGet("/stats/completion").reply((config) => {
    const id = config.params?.project_id;
    if (id && !projects.some((item) => item.project_id === id)) return [404, { status: false, message: "Project not found", data: null }];
    const chosen = projects.find((item) => item.project_id === id);
    return [200, ok(completion(projects, chosen ? { project_id: chosen.project_id, name: chosen.name } : null))];
  });
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken());
});
afterEach(() => api.restore());

describe("statistics per project", () => {
  it("offers all projects or one, with each project's completion", async () => {
    install();
    renderApp("/statistics");
    const picker = await screen.findByRole("combobox", { name: "Project" });
    expect([...picker.options].map((option) => option.textContent)).toEqual(["All projects", "Machine Learning · 42% complete", "Empty"]);
    expect(picker).toHaveValue("");
    // All projects: nothing is narrowed down.
    await waitFor(() => expect(requests("/stats/overview")).toHaveLength(1));
    expect(requests("/stats/overview")[0].params ?? {}).toEqual({});
  });

  it("puts the chosen project in the URL and loads every section for it", async () => {
    install();
    const user = userEvent.setup();
    const { router } = renderApp("/statistics");
    const picker = await screen.findByRole("combobox", { name: "Project" });
    await user.selectOptions(picker, "Machine Learning · 42% complete");

    expect(search(router)).toEqual({ project: "p-ml" });
    await waitFor(() => expect(requests("/stats/overview").at(-1).params).toEqual({ project_id: "p-ml" }));
    await waitFor(() => expect(requests("/stats/exams").at(-1).params).toEqual({ project_id: "p-ml" }));
    await waitFor(() => expect(requests("/stats/completion").some((request) => request.params?.project_id === "p-ml")).toBe(true));
    const cards = await screen.findByRole("region", { name: "Overall" });
    await within(cards).findByText("Exams taken");

    await user.selectOptions(picker, "All projects");
    expect(search(router)).toEqual({});
    await waitFor(() => expect(requests("/stats/overview").at(-1).params ?? {}).toEqual({}));
  });

  it("keeps the project from the URL", async () => {
    install();
    renderApp("/statistics?project=p-ml");
    const picker = await screen.findByRole("combobox", { name: "Project" });
    await waitFor(() => expect(picker).toHaveValue("p-ml"));
    expect(requests("/stats/overview")[0].params).toEqual({ project_id: "p-ml" });
  });

  it("goes back to all projects when the project isn't there any more", async () => {
    install();
    const { router } = renderApp("/statistics?project=p-gone");
    expect(await screen.findByText("That project isn’t in your projects any more. Showing all projects.")).toBeInTheDocument();
    expect(search(router)).toEqual({});
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveValue("");
    await waitFor(() => expect(requests("/stats/overview").at(-1).params ?? {}).toEqual({}));
  });

  it("shows no picker without projects", async () => {
    install({ projects: [] });
    renderApp("/statistics");
    await screen.findByRole("region", { name: "Overall" });
    await waitFor(() => expect(requests("/stats/completion").length).toBeGreaterThan(0));
    expect(screen.queryByRole("combobox", { name: "Project" })).not.toBeInTheDocument();
  });

  it("is in German", async () => {
    localStorage.setItem(`lectra:language:v1:${TEST_USER.id}`, "de");
    install();
    renderApp("/statistics");
    const picker = await screen.findByRole("combobox", { name: "Projekt" });
    expect([...picker.options].map((option) => option.textContent)).toEqual(["Alle Projekte", "Machine Learning · 42 % abgeschlossen", "Empty"]);
  });
});
