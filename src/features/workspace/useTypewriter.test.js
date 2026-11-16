import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useTypewriter, { typingSettings } from "./useTypewriter.js";

const TEXT = "Breadth-first search explores the graph level by level, so it finds a shortest path.";

beforeEach(() => {
  vi.useFakeTimers();
  typingSettings.enabled = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  typingSettings.enabled = false;
});

describe("useTypewriter", () => {
  it("types a new answer out word by word, then shows it in full", () => {
    const { result } = renderHook(() => useTypewriter("a-1", TEXT, true));
    expect(result.current).toEqual({ text: "", typing: true });

    act(() => vi.advanceTimersByTime(200));
    const partial = result.current.text;
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(TEXT.length);
    expect(TEXT.startsWith(partial)).toBe(true);
    // Never stops in the middle of a word.
    expect(TEXT[partial.length]).toMatch(/\s/);
    expect(result.current.typing).toBe(true);

    act(() => vi.advanceTimersByTime(6000));
    expect(result.current).toEqual({ text: TEXT, typing: false });
  });

  it("finishes even a very long answer within about six seconds", () => {
    const long = "word ".repeat(4000).trim();
    const { result } = renderHook(() => useTypewriter("a-long", long, true));
    act(() => vi.advanceTimersByTime(6100));
    expect(result.current).toEqual({ text: long, typing: false });
  });

  it("shows answers loaded from the history at once", () => {
    const { result } = renderHook(() => useTypewriter("a-2", TEXT, false));
    expect(result.current).toEqual({ text: TEXT, typing: false });
  });

  it("does not type an answer again once it was shown (e.g. after coming back from the Exam view)", () => {
    const first = renderHook(() => useTypewriter("a-3", TEXT, true));
    act(() => vi.advanceTimersByTime(100));
    first.unmount();
    const { result } = renderHook(() => useTypewriter("a-3", TEXT, true));
    expect(result.current).toEqual({ text: TEXT, typing: false });
  });

  it("shows the answer at once when the system asks for reduced motion", () => {
    vi.stubGlobal("matchMedia", (query) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    const { result } = renderHook(() => useTypewriter("a-4", TEXT, true));
    expect(result.current).toEqual({ text: TEXT, typing: false });
  });
});
