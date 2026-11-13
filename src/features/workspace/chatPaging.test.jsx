import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { installChatBackend } from "../../test/chatBackend.js";

/*
  Long histories load page by page: the menu's chats 50 at a time (more at the end of the
  list), a chat's messages 100 at a time from the latest (earlier ones when scrolled up).
*/

let api;
let backend;
beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const menu = () => screen.getByRole("navigation", { name: "Chats and this chat's materials" });
const chatButtons = () => within(menu()).queryAllByRole("button", { name: /^Chat \d+$/ });

function manyChats(count, messages = {}) {
  backend = installChatBackend(api, {
    sessions: Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, title: `Chat ${index + 1}`, updated_at: minutesAgo(index) })),
    messages,
  });
}

function longChat(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index + 1}`,
    session_id: "s1",
    role: index % 2 === 0 ? "user" : "assistant",
    content: `Message ${index + 1}`,
    sources: index % 2 === 0 ? null : [],
    created_at: minutesAgo(1000 - index),
  }));
}

describe("chats in the menu, 50 at a time", () => {
  it("lists the newest 50 chats and loads the next 50 from the end of the list", async () => {
    const user = userEvent.setup();
    manyChats(120);
    renderApp("/workspace");
    await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", { name: "Chat 1" });
    expect(chatButtons()).toHaveLength(50);
    // (A page_size 1 request only checks that the server has the chat API.)
    expect(backend.requests.filter((item) => item.key === "sessions" && item.size !== 1).map((item) => item.size)).toEqual([50]);

    await user.click(within(menu()).getByRole("button", { name: "Show more chats" }));
    await waitFor(() => expect(chatButtons()).toHaveLength(100));
    expect(within(menu()).getByRole("button", { name: "Chat 100" })).toBeInTheDocument();

    await user.click(within(menu()).getByRole("button", { name: "Show more chats" }));
    await waitFor(() => expect(chatButtons()).toHaveLength(120));
    expect(within(menu()).queryByRole("button", { name: "Show more chats" })).not.toBeInTheDocument();
  });

  it("has no Show more chats with 50 chats or fewer", async () => {
    manyChats(50);
    renderApp("/workspace");
    await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", { name: "Chat 1" });
    expect(chatButtons()).toHaveLength(50);
    expect(within(menu()).queryByRole("button", { name: "Show more chats" })).not.toBeInTheDocument();
  });

  it("opens a linked chat that is older than the chats loaded so far", async () => {
    manyChats(80, { s75: [{ id: "q", session_id: "s75", role: "user", content: "An old question", sources: null, created_at: minutesAgo(5000) }] });
    renderApp("/workspace?chat=s75");
    expect(await screen.findByRole("heading", { level: 1, name: "Chat 75" })).toBeInTheDocument();
    expect(screen.getByText("An old question")).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Chat 75" })).toHaveAttribute("aria-current", "page");
  });

  it("still says so for a linked chat that isn't the student's", async () => {
    manyChats(80);
    renderApp("/workspace?chat=not-mine");
    expect(await screen.findByText("That chat isn’t in your chats.")).toBeInTheDocument();
  });
});

describe("messages in a chat, 100 at a time", () => {
  it("shows the latest messages and loads earlier ones when scrolled to the top", async () => {
    manyChats(1, { s1: longChat(250) });
    renderApp("/workspace?chat=s1");
    const thread = await screen.findByRole("list", { name: "Messages" });
    await within(thread).findByText("Message 250");
    // 250 messages = pages of 100, 100, 50: the short last page comes with the one before it.
    expect(within(thread).queryByText("Message 100")).not.toBeInTheDocument();
    expect(within(thread).getByText("Message 101")).toBeInTheDocument();
    expect(backend.requests.filter((item) => item.key === "messages").every((item) => item.size === 100)).toBe(true);

    // Scrolling near the top loads the page before.
    const scroller = document.querySelector(".chat__scroll");
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    expect(await within(thread).findByText("Message 1")).toBeInTheDocument();
    expect(within(thread).getByText("Message 250")).toBeInTheDocument();
    expect(within(thread).queryByRole("button", { name: "Show earlier messages" })).not.toBeInTheDocument();
    expect(new Set([...thread.querySelectorAll(".chat-msg")].map((node) => node.textContent)).size).toBe(250); // no duplicates
  });

  it("loads all of a short chat at once", async () => {
    manyChats(1, { s1: longChat(30) });
    renderApp("/workspace?chat=s1");
    const thread = await screen.findByRole("list", { name: "Messages" });
    await within(thread).findByText("Message 30");
    expect(within(thread).getByText("Message 1")).toBeInTheDocument();
    expect(within(thread).queryByRole("button", { name: "Show earlier messages" })).not.toBeInTheDocument();
  });
});
