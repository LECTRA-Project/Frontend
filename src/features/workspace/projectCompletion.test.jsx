import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";

/*
  A project's course completion beside it in the menu (from GET /api/stats/completion):
  a ring described as "42% complete", none for a project without materials, and the menu
  still lists the projects when the completion can't be read.
*/
const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 65 });

let api;

function install(completion) {
  installChatBackend(api, {
    lectures: [KI02],
    projects: [
      { id: "p-ml", name: "Machine Learning", lectureIds: [KI02.id], updated_at: daysAgo(0) },
      { id: "p-new", name: "New course", updated_at: daysAgo(1) },
    ],
  });
  api.onGet("/stats/completion").reply(() => completion);
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

async function projectButtons() {
  const menu = await screen.findByRole("navigation", { name: "Chats and this chat's materials" });
  const list = await within(menu).findByRole("list", { name: "Recent projects" });
  return {
    ml: within(list).getByRole("button", { name: "Machine Learning" }),
    fresh: within(list).getByRole("button", { name: "New course" }),
  };
}

describe("project completion in the menu", () => {
  it("shows each project's completion beside it", async () => {
    install([200, ok({
      lectures: [], overall_percent: 42, weights: { reading: 70, exam: 30 }, project: null,
      projects: [
        { project_id: "p-ml", name: "Machine Learning", lectures: 1, overall_percent: 42 },
        { project_id: "p-new", name: "New course", lectures: 0, overall_percent: 0 },
      ],
    })]);
    renderApp("/workspace");
    const { ml, fresh } = await projectButtons();
    await waitFor(() => expect(ml).toHaveAccessibleDescription("42% complete"));
    expect(within(ml).getByRole("img", { name: "42% complete" })).toBeInTheDocument();
    // No materials: nothing to complete, so no ring.
    expect(fresh).not.toHaveAttribute("aria-describedby");
    expect(within(fresh).queryByRole("img")).not.toBeInTheDocument();
  });

  it("still lists the projects when the completion can't be read", async () => {
    install([500, { status: false, message: "Something went wrong", data: null }]);
    renderApp("/workspace");
    const { ml } = await projectButtons();
    expect(within(ml).queryByRole("img")).not.toBeInTheDocument();
  });
});
