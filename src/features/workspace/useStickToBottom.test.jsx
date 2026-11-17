import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useStickToBottom from "./useStickToBottom.js";

/*
  useStickToBottom over a fake scroll box: jsdom has no layout, so the box's heights and a
  clamped scrollTop are defined here. Animation frames run when flushFrames() is called.
*/

let frames;
let latest;
let box;
let content; // the box's scrollHeight
let assignments; // how many times scrollTop was set
const VIEW = 500;

function Harness() {
  const ref = useRef(null);
  const stick = useStickToBottom(ref);
  useLayoutEffect(() => {
    latest = stick;
  });
  return (
    <>
      <div data-testid="box" tabIndex={0} ref={ref} {...stick.handlers} />
      {stick.showJump && (
        <button type="button" onClick={stick.jumpToLatest}>
          Jump to latest
        </button>
      )}
    </>
  );
}

function flushFrames() {
  const queued = frames;
  frames = [];
  act(() => queued.forEach((callback) => callback()));
}

function setup() {
  render(<Harness />);
  box = screen.getByTestId("box");
  let top = 0;
  Object.defineProperty(box, "scrollHeight", { configurable: true, get: () => content });
  Object.defineProperty(box, "clientHeight", { configurable: true, get: () => VIEW });
  Object.defineProperty(box, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value) => {
      assignments += 1;
      top = Math.max(0, Math.min(value, content - VIEW));
    },
  });
  act(() => latest.reset());
  assignments = 0;
}

const bottom = () => content - VIEW;
// New content arrives (a few more words of the answer).
function grow(px) {
  content += px;
  act(() => latest.contentGrew());
  flushFrames();
}
// The reader scrolls with the wheel (or another input) to `top`.
function wheelTo(top) {
  fireEvent.wheel(box, { deltaY: top < box.scrollTop ? -100 : 100 });
  box.scrollTop = top;
  fireEvent.scroll(box);
}

beforeEach(() => {
  frames = [];
  content = 2000;
  vi.stubGlobal("requestAnimationFrame", (callback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("useStickToBottom", () => {
  it("at the bottom: new content keeps it at the bottom, scrolling at most once per frame", () => {
    setup();
    expect(box.scrollTop).toBe(bottom());

    content += 40;
    act(() => {
      latest.contentGrew();
      latest.contentGrew();
      latest.contentGrew();
    });
    expect(frames).toHaveLength(1);
    flushFrames();
    expect(assignments).toBe(1);
    expect(box.scrollTop).toBe(bottom());

    grow(300);
    expect(box.scrollTop).toBe(bottom());
    expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
  });

  it("scrolled up: new content doesn't change scrollTop, and Jump to latest appears", () => {
    setup();
    wheelTo(600);
    grow(200);
    grow(200);
    expect(box.scrollTop).toBe(600);
    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();
  });

  it("stops following on even a small scroll up (within the bottom zone)", () => {
    setup();
    wheelTo(bottom() - 20);
    const top = box.scrollTop;
    grow(30);
    grow(30);
    expect(box.scrollTop).toBe(top);
  });

  it("follows again once the reader scrolls back to the bottom", () => {
    setup();
    wheelTo(400);
    grow(100);
    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeInTheDocument();

    wheelTo(bottom());
    expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
    grow(100);
    expect(box.scrollTop).toBe(bottom());
  });

  it("follows again when the reader scrolls down to within 80px of the bottom", () => {
    setup();
    wheelTo(400);
    wheelTo(bottom() - 60);
    grow(100);
    expect(box.scrollTop).toBe(bottom());
  });

  it("Jump to latest scrolls to the bottom and follows again", () => {
    setup();
    wheelTo(300);
    grow(150);
    fireEvent.click(screen.getByRole("button", { name: "Jump to latest" }));
    expect(box.scrollTop).toBe(bottom());
    expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
    grow(150);
    expect(box.scrollTop).toBe(bottom());
  });

  it("stops following on PageUp, a touch drag down and a scrollbar drag up", () => {
    setup();
    fireEvent.keyDown(box, { key: "PageUp" });
    grow(100);
    expect(box.scrollTop).toBe(bottom() - 100);

    // After clicking the chat's text the focus is on the page: PageUp there counts too.
    act(() => latest.reset());
    fireEvent.keyDown(document.body, { key: "PageUp" });
    grow(100);
    expect(box.scrollTop).toBe(bottom() - 100);

    // But not in a text field (the composer): PageUp moves its cursor.
    act(() => latest.reset());
    const field = document.createElement("textarea");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "PageUp" });
    grow(100);
    expect(box.scrollTop).toBe(bottom());
    field.remove();

    act(() => latest.reset());
    fireEvent.touchStart(box, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(box, { touches: [{ clientY: 160 }] });
    grow(100);
    expect(box.scrollTop).toBe(bottom() - 100);

    act(() => latest.reset());
    fireEvent.pointerDown(box);
    box.scrollTop = 200;
    fireEvent.scroll(box);
    fireEvent.pointerUp(window);
    grow(100);
    expect(box.scrollTop).toBe(200);
  });

  it("keeps following when the page itself moves the scroll position (content above changing size)", () => {
    setup();
    // No wheel, touch, key or scrollbar input: not the reader's scroll.
    box.scrollTop = bottom() - 120;
    fireEvent.scroll(box);
    grow(50);
    expect(box.scrollTop).toBe(bottom());
  });

  it("keepAtBottom follows a size change only while following, without offering the jump", () => {
    setup();
    content += 80;
    act(() => latest.keepAtBottom());
    flushFrames();
    expect(box.scrollTop).toBe(bottom());

    wheelTo(300);
    content += 80;
    act(() => latest.keepAtBottom());
    flushFrames();
    expect(box.scrollTop).toBe(300);
    expect(screen.queryByRole("button", { name: "Jump to latest" })).not.toBeInTheDocument();
  });
});
