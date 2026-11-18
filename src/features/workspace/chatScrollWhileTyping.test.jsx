import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatView } from "./pages/ChatPage.jsx";
import { typingSettings } from "./useTypewriter.js";

/*
  The chat while an answer is typed out (useTypewriter, on here): the view follows it only
  while the student is at the bottom; scrolled up, it stays put and "Jump to latest" shows.
  Blocks already complete keep their elements while the answer grows, and a Mermaid block is
  a placeholder until the answer is complete, then drawn once.
*/

const { renderDiagrams } = vi.hoisted(() => ({
  // Draws a diagram the way services/notebook/diagrams.js does: the block becomes a <figure>.
  renderDiagrams: vi.fn(async (container) => {
    for (const code of container.querySelectorAll("pre > code.language-mermaid")) {
      const figure = document.createElement("figure");
      figure.className = "chat-diagram";
      code.closest(".chat-code").replaceWith(figure);
    }
  }),
}));
vi.mock("../../services/notebook/diagrams.js", () => ({
  hasDiagrams: (container) => Boolean(container?.querySelector("pre > code.language-mermaid")),
  renderDiagrams,
}));

const ANSWER = [
  "Decision trees split the data step by step. ".repeat(6),
  "## How it works",
  "- choose the best attribute\n- split the records\n- repeat for each branch",
  "```mermaid\nflowchart TD\n  A[\"Customer Data\"] --> B{Split?}\n  B --> C[Leaf]\n```",
  "```python\nfrom sklearn.tree import DecisionTreeClassifier\nclf = DecisionTreeClassifier()\n```",
  "| Measure | Range |\n| --- | --- |\n| Gini | 0 to 0.5 |",
  "$$G = 1 - \\sum_i p_i^2$$",
  "That is the whole idea. ".repeat(8),
].join("\n\n");

const message = (id, role, content, extra = {}) => ({ id, role, content, sources: [], created_at: "2026-11-17T10:00:00Z", ...extra });
const BASE = [message("q1", "user", "Hi"), message("a1", "assistant", "Hello.")];

const VIEW = 400;
const scrollTops = new WeakMap();
const isChat = (element) => element.classList?.contains("chat__scroll");
// The chat's scroll height in this fake layout: grows with the text shown.
const contentHeight = () => 1000 + (document.querySelector(".chat__thread")?.textContent.length ?? 0);
const saved = {};

function props(messages, extra = {}) {
  return {
    available: true,
    session: { id: "s1", title: "Trees" },
    messages,
    loading: false,
    busy: false,
    materials: [],
    materialType: () => null,
    lectureTitle: () => "",
    onOpenSource: () => {},
    onUploadClick: () => {},
    onSend: () => true,
    note: null,
    cellContext: [],
    cellDragActive: false,
    cellDragOver: false,
    onAddCell: () => {},
    onRemoveCell: () => {},
    announcement: { text: "", seq: 0 },
    ...extra,
  };
}

function renderChat(messages, extra) {
  const view = render(
    <MemoryRouter>
      <ChatView {...props(messages, extra)} />
    </MemoryRouter>
  );
  return {
    rerender: (next, more) =>
      view.rerender(
        <MemoryRouter>
          <ChatView {...props(next, more)} />
        </MemoryRouter>
      ),
  };
}

const chat = () => document.querySelector(".chat__scroll");
const bottom = () => contentHeight() - VIEW;
const tick = (ms = 40) => act(() => vi.advanceTimersByTime(ms));
// The next animation frame (where following scrolls), as the browser runs before painting.
const frame = () => tick(16);
// Answers animate once per id (useTypewriter), so each test types a new one.
let answerCount = 0;
const typedAnswer = () => message(`typed-${++answerCount}`, "assistant", ANSWER, { fresh: true });
const typeAll = () => act(() => vi.advanceTimersByTime(8000));
const jump = () => screen.queryByRole("button", { name: "Jump to latest" });
function wheelTo(top) {
  fireEvent.wheel(chat(), { deltaY: -100 });
  chat().scrollTop = top;
  fireEvent.scroll(chat());
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 16));
  vi.stubGlobal("cancelAnimationFrame", (id) => clearTimeout(id));
  typingSettings.enabled = true;
  renderDiagrams.mockClear();
  for (const name of ["scrollHeight", "clientHeight", "scrollTop"]) saved[name] = Object.getOwnPropertyDescriptor(Element.prototype, name);
  Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get() { return isChat(this) ? contentHeight() : 0; } });
  Object.defineProperty(Element.prototype, "clientHeight", { configurable: true, get() { return isChat(this) ? VIEW : 0; } });
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get() {
      return scrollTops.get(this) ?? 0;
    },
    set(value) {
      const max = isChat(this) ? Math.max(0, contentHeight() - VIEW) : 0;
      scrollTops.set(this, Math.max(0, Math.min(value, max)));
    },
  });
});
afterEach(() => {
  for (const [name, descriptor] of Object.entries(saved)) Object.defineProperty(Element.prototype, name, descriptor);
  typingSettings.enabled = false;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the chat while an answer is typed out", () => {
  it("follows the answer while at the bottom, and stays put when the student scrolls up", () => {
    const view = renderChat(BASE);
    expect(chat().scrollTop).toBe(bottom());

    view.rerender([...BASE, message("q2", "user", "Explain trees"), typedAnswer()]);
    for (let i = 0; i < 10; i += 1) tick();
    frame();
    expect(chat().scrollTop).toBe(bottom());
    expect(jump()).not.toBeInTheDocument();

    // A small scroll up already stops following: nothing pulls the view back.
    wheelTo(bottom() - 30);
    const reading = chat().scrollTop;
    for (let i = 0; i < 20; i += 1) tick();
    expect(chat().scrollTop).toBe(reading);
    expect(jump()).toBeInTheDocument();

    // Jump to latest: to the bottom, following again.
    fireEvent.click(jump());
    expect(chat().scrollTop).toBe(bottom());
    expect(jump()).not.toBeInTheDocument();
    tick();
    tick();
    frame();
    expect(chat().scrollTop).toBe(bottom());

    typeAll();
    frame(); // the footer appears with the last render: followed in the next frame
    expect(chat().scrollTop).toBe(bottom());
    expect(screen.getAllByRole("button", { name: "Copy answer" })).toHaveLength(2);
  });

  it("goes back to the bottom and follows when the student sends a new question", () => {
    const view = renderChat(BASE);
    const longer = [...BASE, message("q2", "user", "Explain trees"), typedAnswer()];
    view.rerender(longer);
    tick();
    wheelTo(100);
    for (let i = 0; i < 5; i += 1) tick();
    expect(chat().scrollTop).toBe(100);
    expect(jump()).toBeInTheDocument();

    view.rerender([...longer, message("q3", "user", "And pruning?", { pending: true })], { busy: true });
    expect(chat().scrollTop).toBe(bottom());
    expect(jump()).not.toBeInTheDocument();
  });

  it("starts another chat at its bottom, following, without the jump button", () => {
    const view = renderChat([...BASE, typedAnswer()]);
    tick();
    wheelTo(100);
    for (let i = 0; i < 5; i += 1) tick();
    expect(jump()).toBeInTheDocument();

    view.rerender([message("x1", "user", "Other chat"), message("x2", "assistant", "Other answer.")], { session: { id: "s2", title: "Other" } });
    expect(chat().scrollTop).toBe(bottom());
    expect(jump()).not.toBeInTheDocument();
    expect(screen.queryByText(/Decision trees split/)).not.toBeInTheDocument();
  });

  it("keeps the elements of blocks already complete, shows a diagram placeholder while typing and draws it once", async () => {
    renderChat([...BASE, typedAnswer()]);
    const answer = () => document.querySelectorAll(".chat-answer .chat-msg__md")[1];
    // Type until the diagram has started (the paragraph, heading and list are complete).
    let guard = 0;
    while (!answer().querySelector("code.language-mermaid") && guard++ < 200) tick();
    const firstParagraph = answer().querySelector("p");
    expect(firstParagraph).toHaveTextContent(/^Decision trees split/);
    expect(answer().querySelector(".chat-code--diagram")).toHaveTextContent("Rendering diagram…");
    expect(renderDiagrams).not.toHaveBeenCalled();
    const heading = answer().querySelector("h2");
    const list = answer().querySelector("ul");

    for (let i = 0; i < 10; i += 1) tick();
    // The same elements, not new copies.
    expect(answer().querySelector("p")).toBe(firstParagraph);
    expect(answer().querySelector("h2")).toBe(heading);
    expect(answer().querySelector("ul")).toBe(list);
    expect(firstParagraph.isConnected).toBe(true);

    typeAll();
    await act(async () => {});
    expect(renderDiagrams).toHaveBeenCalledTimes(1);
    expect(answer().querySelector("figure.chat-diagram")).not.toBeNull();
    expect(answer().querySelector(".chat-code--diagram")).toBeNull();
    expect(answer().querySelector("table")).not.toBeNull();
    expect(answer().querySelector(".katex")).not.toBeNull();
    expect(answer().querySelector("p")).toBe(firstParagraph);

    tick(1000);
    expect(renderDiagrams).toHaveBeenCalledTimes(1);
  });

  it("shows a diagram's code when it can't be drawn", async () => {
    renderDiagrams.mockImplementationOnce(async () => {});
    renderChat([...BASE, typedAnswer()]);
    typeAll();
    await act(async () => {});
    const block = document.querySelector("code.language-mermaid").closest(".chat-code");
    expect(block).not.toHaveClass("chat-code--diagram");
  });
});
