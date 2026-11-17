import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";

/*
  Failures in the chat-first workspace stay with the chat they happened in: a failed answer
  (with "Try again"), and failed uploads into a new chat.
*/

const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 65 });

let api;
let backend;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  let next = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${next++}`, revokeObjectURL: () => {} }));
  backend = installChatBackend(api, {
    lectures: [KI02],
    sessions: [{ id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id], updated_at: daysAgo(0) }],
    messages: {},
  });
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
});

const menu = () => screen.getByRole("navigation", { name: "Chats and this chat's materials" });
const input = () => screen.getByLabelText("Message to the study assistant");
const newChatButton = () => within(menu()).getAllByRole("button", { name: "New chat" })[0];
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

async function openWorkspace() {
  const user = userEvent.setup();
  renderApp("/workspace");
  await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", { name: "Hunt's algorithm" });
  return user;
}

async function openChat(user, title) {
  await user.click(within(menu()).getByRole("button", { name: title }));
  await screen.findByRole("heading", { level: 1, name: title });
}

describe("a failed answer", () => {
  it("stays out of a new chat opened while it was pending (#3)", async () => {
    let release;
    api.onPost(/\/chat\/sessions\/s-hunt\/messages$/).replyOnce(() => new Promise((resolve) => (release = resolve)));
    api.handlers.unshift(api.handlers.pop()); // checked before the fake backend's handler
    const user = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.type(input(), "Slow question{Enter}");
    expect(await screen.findByText("Reading your materials…")).toBeInTheDocument();

    await user.click(newChatButton());
    await screen.findByRole("heading", { name: "What are we studying today?" });
    release([503, { detail: "Assistant unavailable (mock)" }]);
    await settle();

    expect(screen.queryByText("Assistant unavailable (mock)")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What are we studying today?" })).toBeInTheDocument();
  });

  it("can be asked again with Try again, replacing the failed question and its error (#23)", async () => {
    api.onPost(/\/chat\/sessions\/s-hunt\/messages$/).replyOnce(503, { detail: "Assistant unavailable (mock)" });
    api.handlers.unshift(api.handlers.pop());
    const user = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.type(input(), "And Gini?{Enter}");

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Assistant unavailable (mock)");
    await user.click(within(error).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(backend.sent).toEqual([{ id: "s-hunt", content: "And Gini?" }]));
    await waitFor(() => expect(screen.queryByText("Assistant unavailable (mock)")).not.toBeInTheDocument());
    // The question shows once: the failed copy left with its error.
    await waitFor(() => expect(screen.queryByText("Reading your materials…")).not.toBeInTheDocument());
    expect(screen.getAllByText("And Gini?")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("offers no Try again after a time-out, since the answer may still arrive", async () => {
    api.onPost(/\/chat\/sessions\/s-hunt\/messages$/).timeoutOnce();
    api.handlers.unshift(api.handlers.pop());
    const user = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.type(input(), "Slow question{Enter}");
    expect(await screen.findByText(/taking longer than usual/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("uploads into a new chat (#4)", () => {
  it("keeps a failed file listed in the chat created for the batch, and the notice counts it", async () => {
    api.onPost(/upload-lecture$/).replyOnce(422, { detail: "File content does not match its supported format" });
    api.handlers.unshift(api.handlers.pop());
    const user = await openWorkspace();
    await user.click(within(menu()).getByRole("button", { name: "Upload a material to this chat" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(within(dialog).getByTestId("upload-input"), [
      new File(["%PDF-broken"], "qa3-broken.pdf", { type: "application/pdf" }),
      new File(["%PDF-1.4"], "qa3-lecture.pdf", { type: "application/pdf" }),
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("1 uploaded, 1 failed.")).toBeInTheDocument();
    // The created chat lists the good material and still the failed file with its error.
    await waitFor(() => expect(within(menu()).getByRole("button", { name: "Open qa3 lecture beside the chat" })).toBeInTheDocument());
    expect(within(menu()).getByText("qa3-broken.pdf")).toBeInTheDocument();
    expect(within(menu()).getByText("File content does not match its supported format")).toBeInTheDocument();

    // A new chat doesn't show it.
    await user.click(newChatButton());
    await screen.findByRole("heading", { name: "What are we studying today?" });
    expect(within(menu()).queryByText("qa3-broken.pdf")).not.toBeInTheDocument();

    // Back in the created chat it is still there.
    await user.click(within(within(menu()).getByRole("list", { name: "Today" })).getByRole("button", { name: "New chat" }));
    await waitFor(() => expect(within(menu()).getByRole("button", { name: "Open qa3 lecture beside the chat" })).toBeInTheDocument());
    expect(within(menu()).getByText("qa3-broken.pdf")).toBeInTheDocument();
  });
});
