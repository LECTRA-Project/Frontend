import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearExamProgress,
  countAnswered,
  isAnswered,
  loadExamProgress,
  saveExamProgress,
  updateExamProgress,
} from "./examStorage.js";

describe("exam answers on this device", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the answers per user and exam", () => {
    expect(saveExamProgress("u-1", "e-1", { answers: { q1: ["a", "c"], q2: "Because" }, current: 1 })).toBe(true);
    expect(loadExamProgress("u-1", "e-1")).toEqual({ answers: { q1: ["a", "c"], q2: "Because" }, current: 1, settings: null });
    expect(loadExamProgress("u-2", "e-1").answers).toEqual({});
    expect(loadExamProgress("u-1", "e-2").answers).toEqual({});
  });

  it("merges changes and clears an exam", () => {
    const settings = { lectureIds: ["l-1"], questionCount: 3, types: ["short_answer"] };
    updateExamProgress("u-1", "e-1", { settings });
    updateExamProgress("u-1", "e-1", { answers: { q1: "x" } });
    expect(loadExamProgress("u-1", "e-1")).toEqual({ answers: { q1: "x" }, current: 0, settings });
    clearExamProgress("u-1", "e-1");
    expect(loadExamProgress("u-1", "e-1").settings).toBeNull();
  });

  it("reads damaged data as empty", () => {
    localStorage.setItem("lectra:exam:v1:u-1:e-1", "{not json");
    expect(loadExamProgress("u-1", "e-1")).toEqual({ answers: {}, current: 0, settings: null });
    localStorage.setItem("lectra:exam:v1:u-1:e-1", JSON.stringify({ answers: null, current: -3 }));
    expect(loadExamProgress("u-1", "e-1")).toEqual({ answers: {}, current: 0, settings: null });
  });

  it("reports false instead of throwing when the browser refuses to save or read", () => {
    // jsdom's Storage keeps its methods on the prototype; the test fallback on the object.
    const target = typeof Storage !== "undefined" && localStorage instanceof Storage ? Storage.prototype : localStorage;
    vi.spyOn(target, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    vi.spyOn(target, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(target, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(saveExamProgress("u-1", "e-1", { answers: { q1: "x" } })).toBe(false);
    expect(loadExamProgress("u-1", "e-1").answers).toEqual({});
    expect(() => clearExamProgress("u-1", "e-1")).not.toThrow();
  });

  it("counts an answer as given only with a choice or non-blank text", () => {
    expect([[], ["a"], "", "   ", "x", undefined].map(isAnswered)).toEqual([false, true, false, false, true, false]);
    const answers = { q1: ["b"], q2: " ", q3: "Leaf", q9: "other exam" };
    expect(countAnswered(answers, [{ id: "q1" }, { id: "q2" }, { id: "q3" }])).toBe(2);
    expect(countAnswered(answers)).toBe(3);
  });
});
