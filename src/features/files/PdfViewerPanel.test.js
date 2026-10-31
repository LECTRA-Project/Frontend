import { describe, expect, it } from "vitest";

import { getFitZoomIndex } from "./pdfZoom.js";

describe("PDF viewer fit zoom", () => {
  it.each([
    [500, 0],
    [620, 1],
    [900, 2],
    [1600, 2],
  ])("fits a %s-pixel panel at zoom step %s", (panelWidth, expectedIndex) => {
    expect(getFitZoomIndex(panelWidth)).toBe(expectedIndex);
  });
});
