import { describe, expect, it } from "vitest";

import { choiceLetter, formatExamDate, pagesLabel, plainText, pointsLabel } from "./examFormat.js";

describe("exam text helpers", () => {
  it("names the pages a question comes from", () => {
    expect(pagesLabel([12])).toBe("page 12");
    expect(pagesLabel([13, 12, 14, 12])).toBe("pages 12–14");
    expect(pagesLabel([2, 5], "slide")).toBe("slides 2, 5");
    expect(pagesLabel([3], "cell")).toBe("cell 3");
    expect(pagesLabel([])).toBe("");
    expect(pagesLabel(null)).toBe("");
  });

  it("formats points, letters and dates", () => {
    expect([pointsLabel(1), pointsLabel(3), pointsLabel(null)]).toEqual(["1 point", "3 points", "0 points"]);
    expect([0, 1, 3].map(choiceLetter)).toEqual(["A", "B", "D"]);
    const now = new Date("2026-11-13T12:00:00");
    expect(formatExamDate("2026-11-13T09:05:00", now)).toMatch(/^13 Nov,? 09:05$/);
    expect(formatExamDate("2025-01-02T09:05:00", now)).toMatch(/2025/);
    expect(formatExamDate("nonsense", now)).toBe("");
  });

  it("turns a Markdown question into one line of text", () => {
    expect(plainText("Split **12** examples:\n\n- Child 1: 6\n- Child 2: 6")).toBe("Split 12 examples: Child 1: 6 Child 2: 6");
  });
});
