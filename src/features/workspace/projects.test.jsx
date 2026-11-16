import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";
import { installExamBackend } from "../../test/examBackend.js";

/*
  Projects: the menu's Projects section, the all-projects page, a project's page (its
  materials, its chats and the box that starts a chat in it), project chats in the chat list,
  moving chats in and out, and deleting a project.
*/

const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 65 });
const EX31 = lectureFixture("l-ex31", "Exercise 3-1 Classification", { count: 2 });
const NOTES = lectureFixture("l-notes", "Linear algebra notes", { count: 4 });

let api;
let backend;

function install(overrides = {}) {
  backend = installChatBackend(api, {
    lectures: [KI02, EX31, NOTES],
    projects: [
      { id: "p-ml", name: "Machine Learning", lectureIds: [KI02.id], updated_at: daysAgo(0) },
      { id: "p-la", name: "Linear Algebra", lectureIds: [NOTES.id], updated_at: daysAgo(1) },
      { id: "p-old", name: "Old course", updated_at: daysAgo(5) },
      { id: "p-older", name: "Older course", updated_at: daysAgo(9) },
    ],
    sessions: [
      { id: "s-trees", title: "Decision trees", projectId: "p-ml", updated_at: daysAgo(0, 9) },
      { id: "s-svm", title: "Support vectors", projectId: "p-ml", updated_at: daysAgo(2) },
      { id: "s-free", title: "Exercise help", lectureIds: [EX31.id], updated_at: daysAgo(0, 8) },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  install();
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const menu = () => screen.getByRole("navigation", { name: "Chats and this chat's materials" });
const recent = () => within(menu()).getByRole("list", { name: "Recent projects" });

async function openWorkspace(path = "/workspace") {
  const user = userEvent.setup();
  renderApp(path);
  await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("list", {
    name: "Recent projects",
  });
  return user;
}

describe("projects in the menu", () => {
  it("lists the 3 most recently active projects and opens all of them", async () => {
    const user = await openWorkspace();
    const names = within(recent())
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual(["Machine Learning", "Linear Algebra", "Old course"]);

    await user.click(within(menu()).getByRole("button", { name: "View all projects" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Projects" });
    expect(within(list).getAllByRole("button")).toHaveLength(4);
    expect(within(list).getByRole("button", { name: /Machine Learning/ })).toHaveTextContent("2 chats · 1 material");
  });

  it("offers View all projects only with more than 3 projects", async () => {
    install({
      projects: [
        { id: "p-ml", name: "Machine Learning", updated_at: daysAgo(0) },
        { id: "p-la", name: "Linear Algebra", updated_at: daysAgo(1) },
        { id: "p-old", name: "Old course", updated_at: daysAgo(5) },
      ],
      sessions: [],
    });
    await openWorkspace();
    expect(within(recent()).getAllByRole("button")).toHaveLength(3);
    expect(within(menu()).queryByRole("button", { name: "View all projects" })).not.toBeInTheDocument();
  });

  it("creates a project with a name and opens its page", async () => {
    const user = await openWorkspace();
    await user.click(within(menu()).getByRole("button", { name: "New project" }));
    const dialog = screen.getByRole("dialog", { name: "New project" });
    await user.type(within(dialog).getByLabelText("Project name"), "  Statistics  ");
    await user.click(within(dialog).getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
    expect(backend.projects.at(-1).name).toBe("Statistics");
    expect(screen.getByText("No chats yet. Ask a question above to start one.")).toBeInTheDocument();
    await waitFor(() => expect(within(recent()).getAllByRole("button")[0]).toHaveTextContent("Statistics"));
  });

  it("shows a project chat with its project's tag; the row opens the chat", async () => {
    const user = await openWorkspace();
    const row = within(menu()).getByRole("button", { name: "Decision trees in Machine Learning" });
    await user.click(row);
    expect(await screen.findByRole("heading", { level: 1, name: "Decision trees" })).toBeInTheDocument();
    // Its materials are the project's.
    expect(within(menu()).getByRole("heading", { name: "Materials in Machine Learning" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" })).toBeInTheDocument();
    // Removing a material here asks first: it leaves the whole project.
    await user.click(within(menu()).getByRole("button", { name: "Remove KI 02 Classification Part1 from this chat" }));
    const ask = screen.getByRole("dialog", { name: "Remove from the project?" });
    expect(ask).toHaveTextContent("will be removed from the project Machine Learning");
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(backend.projects.find((item) => item.id === "p-ml").lectureIds).toEqual([KI02.id]);
    // The tag in the bar opens the project.
    await user.click(screen.getByRole("button", { name: "Open the project Machine Learning" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Machine Learning" })).toBeInTheDocument();
  });
});

describe("a project's page", () => {
  it("starts a chat in the project from its input box and opens it with the answer", async () => {
    const user = await openWorkspace("/workspace/projects/p-ml");
    expect(await screen.findByRole("heading", { level: 1, name: "Machine Learning" })).toBeInTheDocument();
    const chats = await screen.findByRole("list", { name: "Chats in this project" });
    expect(within(chats).getAllByRole("button").map((button) => button.textContent)).toEqual([
      expect.stringContaining("Decision trees"),
      expect.stringContaining("Support vectors"),
    ]);

    await user.type(screen.getByLabelText("Message to the study assistant"), "What is pruning?{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "What is pruning?" }, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByText(/Hunt's algorithm grows a tree/, {}, { timeout: 4000 })).toBeInTheDocument();
    const created = backend.sessions.find((item) => item.title === "What is pruning?");
    expect(created.projectId).toBe("p-ml");
    expect(backend.sent).toEqual([{ id: created.id, content: "What is pruning?" }]);
    // The answer cites the project's material.
    expect(within(screen.getByRole("list", { name: "Messages" })).getByRole("button", { name: /KI 02 Classification Part1/ })).toBeInTheDocument();
  });

  it("adds and removes the project's materials; its chats follow", async () => {
    const user = await openWorkspace("/workspace/projects/p-ml");
    const materials = await screen.findByRole("list", { name: "Materials in this project" });
    expect(within(materials).getByRole("button", { name: "Open KI 02 Classification Part1 beside the project" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add one of your materials to this project" }));
    await user.click(screen.getByRole("menuitem", { name: "Exercise 3-1 Classification" }));
    await waitFor(() => expect(backend.projects.find((item) => item.id === "p-ml").lectureIds).toEqual([KI02.id, EX31.id]));
    expect(within(materials).getByRole("button", { name: "Open Exercise 3-1 Classification beside the project" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove KI 02 Classification Part1 from this project" }));
    // It asks first, naming what happens.
    const ask = screen.getByRole("dialog", { name: "Remove from the project?" });
    expect(ask).toHaveTextContent("none of its chats answer from it any more. The file stays in your library.");
    expect(backend.projects.find((item) => item.id === "p-ml").lectureIds).toEqual([KI02.id, EX31.id]);
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(backend.projects.find((item) => item.id === "p-ml").lectureIds).toEqual([EX31.id]));

    // A chat of the project now has the project's new materials.
    await user.click(within(screen.getByRole("list", { name: "Chats in this project" })).getByRole("button", { name: /Decision trees/ }));
    await screen.findByRole("heading", { level: 1, name: "Decision trees" });
    expect(within(menu()).getByRole("button", { name: "Open Exercise 3-1 Classification beside the chat" })).toBeInTheDocument();
    expect(within(menu()).queryByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" })).not.toBeInTheDocument();
  });

  it("renames the project", async () => {
    const user = await openWorkspace("/workspace/projects/p-la");
    await screen.findByRole("heading", { level: 1, name: "Linear Algebra" });
    await user.click(screen.getByRole("button", { name: "Project actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename project" }));
    const field = within(screen.getByRole("dialog")).getByLabelText("Project name");
    await user.clear(field);
    await user.type(field, "Linear Algebra II{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Linear Algebra II" })).toBeInTheDocument();
    await waitFor(() => expect(within(recent()).getByRole("button", { name: "Linear Algebra II" })).toBeInTheDocument());
  });

  it("deletes the project and its chats after naming the consequences", async () => {
    const user = await openWorkspace("/workspace/projects/p-ml");
    await screen.findByRole("heading", { level: 1, name: "Machine Learning" });
    await screen.findByRole("list", { name: "Chats in this project" });
    await user.click(screen.getByRole("button", { name: "Project actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete project" }));

    const dialog = screen.getByRole("dialog", { name: "Delete project?" });
    expect(dialog).toHaveTextContent("All 2 chats in it and their messages will be deleted permanently.");
    expect(dialog).toHaveTextContent("Its materials stay in your library.");
    expect(dialog).toHaveTextContent("Your exams and statistics are not affected.");
    await user.click(within(dialog).getByRole("button", { name: "Delete project" }));

    expect(await screen.findByText("Project “Machine Learning” and its 2 chats were deleted.")).toBeInTheDocument();
    expect(backend.projects.map((item) => item.id)).not.toContain("p-ml");
    expect(backend.sessions.map((item) => item.id)).toEqual(["s-free"]);
    expect(backend.lectures).toHaveLength(3);
    await waitFor(() => expect(within(menu()).queryByRole("button", { name: /Decision trees/ })).not.toBeInTheDocument());
    expect(within(menu()).getByRole("button", { name: "Exercise help" })).toBeInTheDocument();
  });

  it("opens the Exam view with the project's materials and goes back to the project", async () => {
    installExamBackend(api);
    const user = await openWorkspace("/workspace/projects/p-ml");
    await screen.findByRole("heading", { level: 1, name: "Machine Learning" });
    await user.click(screen.getByRole("button", { name: "Exam" }));
    const group = await screen.findByRole("group", { name: "Materials in Machine Learning" }, { timeout: 4000 });
    expect(within(group).getByRole("checkbox", { name: /KI 02 Classification Part1/ })).toBeChecked();
    expect(screen.getByText(/Questions are generated from the materials of Machine Learning/)).toBeInTheDocument();
    // No chat is open, so the menu shows no chat materials.
    expect(within(menu()).queryByRole("heading", { name: "Materials in this chat" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to project" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Machine Learning" })).toBeInTheDocument();
  });

  it("tells when the project is not the student's", async () => {
    await openWorkspace("/workspace/projects/p-missing");
    expect(await screen.findByText("That project isn’t in your projects.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "New chat" })).toBeInTheDocument();
  });
});

describe("moving chats in and out of projects", () => {
  it("moves a chat into a project, adding its materials when ticked", async () => {
    const user = await openWorkspace();
    await user.click(within(menu()).getByRole("button", { name: "Exercise help" }));
    await screen.findByRole("heading", { level: 1, name: "Exercise help" });
    await user.click(screen.getByRole("button", { name: "Chat actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Move to project…" }));

    const dialog = screen.getByRole("dialog", { name: "Move to project" });
    expect(dialog).toHaveTextContent("“Exercise help” will answer from the project’s materials");
    await within(dialog).findByRole("radio", { name: "Linear Algebra" });
    const extra = within(dialog).getByRole("checkbox", { name: /Also add this chat’s material to the project/ });
    expect(extra).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: "Linear Algebra" }));
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(await screen.findByText("Chat moved to Linear Algebra.")).toBeInTheDocument();
    expect(backend.moved).toEqual([{ id: "s-free", body: { project_id: "p-la", add_materials: true } }]);
    expect(within(menu()).getByRole("heading", { name: "Materials in Linear Algebra" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Open Exercise 3-1 Classification beside the chat" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Open Linear algebra notes beside the chat" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Exercise help in Linear Algebra" })).toBeInTheDocument();
  });

  it("can move without the chat's materials, into a new project", async () => {
    const user = await openWorkspace();
    await user.click(within(menu()).getByRole("button", { name: "Actions for Exercise help" }));
    await user.click(screen.getByRole("menuitem", { name: "Move to project…" }));
    const dialog = screen.getByRole("dialog", { name: "Move to project" });
    await user.click(await within(dialog).findByRole("radio", { name: "New project" }));
    await user.type(within(dialog).getByLabelText("Project name"), "Exercises");
    await user.click(within(dialog).getByRole("checkbox", { name: /Also add/ }));
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(await screen.findByText("Chat moved to Exercises.")).toBeInTheDocument();
    const created = backend.projects.find((item) => item.name === "Exercises");
    expect(backend.moved).toEqual([{ id: "s-free", body: { project_id: created.id, add_materials: false } }]);
    expect(created.lectureIds).toEqual([]);
  });

  it("removes a chat from its project; it keeps a copy of the materials", async () => {
    const user = await openWorkspace("/workspace?chat=s-trees");
    await screen.findByRole("heading", { level: 1, name: "Decision trees" });
    await user.click(screen.getByRole("button", { name: "Chat actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove from project" }));

    expect(await screen.findByText("Chat removed from Machine Learning. It keeps a copy of the materials.")).toBeInTheDocument();
    expect(within(menu()).getByRole("heading", { name: "Materials in this chat" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Decision trees" })).toBeInTheDocument();
    expect(backend.sessions.find((item) => item.id === "s-trees")).toMatchObject({ projectId: null, lectureIds: [KI02.id] });
  });
});

describe("all projects", () => {
  it("shows 30 per page with page navigation", async () => {
    install({
      projects: Array.from({ length: 35 }, (_, index) => ({
        id: `p-${index}`,
        name: `Course ${String(index + 1).padStart(2, "0")}`,
        updated_at: daysAgo(index),
      })),
      sessions: [],
    });
    const user = await openWorkspace("/workspace/projects");
    const list = await screen.findByRole("list", { name: "Projects" });
    expect(within(list).getAllByRole("button")).toHaveLength(30);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Projects" })).getAllByRole("button")).toHaveLength(5));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Projects" })).getAllByRole("button")[0]).toHaveTextContent("Course 31");

    await user.click(within(screen.getByRole("list", { name: "Projects" })).getByRole("button", { name: /Course 35/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Course 35" })).toBeInTheDocument();
  });

  it("invites to create the first project", async () => {
    install({ projects: [], sessions: [] });
    renderApp("/workspace/projects");
    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
  });
});
