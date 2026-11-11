import { afterEach, describe, expect, it } from "vitest";

import {
  computeGrid,
  DEFAULT_LAYOUT,
  isValidLayout,
  loadLayout,
  minimumWidth,
  moveSection,
  placeSection,
  saveLayout,
} from "./sectionLayout.js";

const ALL = new Set(["materials", "pdf", "notebook", "assistant"]);
const NO_PDF = new Set(["materials", "notebook", "assistant"]);

afterEach(() => localStorage.clear());

describe("layout validation and storage", () => {
  it("accepts the default and rejects broken layouts", () => {
    expect(isValidLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(isValidLayout([["materials"], ["notebook"], ["assistant"]])).toBe(false); // PDF missing
    expect(isValidLayout([["materials", "materials"], ["pdf", "notebook", "assistant"]])).toBe(false);
    expect(isValidLayout([["materials", "pdf", "notebook", "assistant"]])).toBe(false); // 4 in a column
    expect(isValidLayout([["materials"], [], ["pdf", "notebook", "assistant"]])).toBe(false);
    expect(isValidLayout([["materials"], ["pdf"], ["notebook"], ["assistant"]])).toBe(true);
    expect(isValidLayout("nope")).toBe(false);
  });

  it("saves per user, and falls back to the default for missing, corrupted or invalid data", () => {
    const moved = [["assistant"], ["materials"], ["pdf", "notebook"]];
    saveLayout("u1", moved);
    expect(loadLayout("u1")).toEqual(moved);
    expect(loadLayout("u2")).toEqual(DEFAULT_LAYOUT);

    localStorage.setItem("lectra:workspace-layout:v1:u3", "{ broken");
    expect(loadLayout("u3")).toEqual(DEFAULT_LAYOUT);
    localStorage.setItem("lectra:workspace-layout:v1:u4", JSON.stringify([["materials"], ["notebook"]]));
    expect(loadLayout("u4")).toEqual(DEFAULT_LAYOUT);

    saveLayout("u1", DEFAULT_LAYOUT); // the default is stored as "nothing saved"
    expect(localStorage.getItem("lectra:workspace-layout:v1:u1")).toBeNull();
  });
});

describe("placing a dragged section", () => {
  it.each([
    ["assistant", "materials", "left", [["assistant"], ["materials"], ["pdf", "notebook"]]],
    ["pdf", "notebook", "bottom", [["materials"], ["notebook", "pdf"], ["assistant"]]],
    ["pdf", "notebook", "left", [["materials"], ["pdf"], ["notebook"], ["assistant"]]],
    ["pdf", "notebook", "right", [["materials"], ["notebook"], ["pdf"], ["assistant"]]],
    ["notebook", "assistant", "top", [["materials"], ["pdf"], ["notebook", "assistant"]]],
    ["materials", "assistant", "right", [["pdf", "notebook"], ["assistant"], ["materials"]]],
  ])("%s dropped %s… %s", (id, target, edge, expected) => {
    expect(placeSection(DEFAULT_LAYOUT, id, target, edge)).toEqual(expected);
  });

  it("rejects drops that change nothing, target itself, or overfill a column", () => {
    expect(placeSection(DEFAULT_LAYOUT, "pdf", "notebook", "top")).toBeNull(); // already there
    expect(placeSection(DEFAULT_LAYOUT, "pdf", "pdf", "left")).toBeNull();
    expect(placeSection(DEFAULT_LAYOUT, "pdf", "notebook", "middle")).toBeNull();
    const full = [["materials", "pdf", "notebook"], ["assistant"]];
    expect(placeSection(full, "assistant", "pdf", "top")).toBeNull();
  });
});

describe("keyboard moves", () => {
  it("steps a section left: join the neighbouring column, then split out past it", () => {
    const joined = moveSection(DEFAULT_LAYOUT, "assistant", "left", ALL);
    expect(joined).toEqual([["materials"], ["pdf", "notebook", "assistant"]]);
    expect(moveSection(joined, "assistant", "left", ALL)).toEqual([["materials"], ["assistant"], ["pdf", "notebook"]]);
  });

  it("moves up and down within a column, skipping sections that aren't shown", () => {
    expect(moveSection(DEFAULT_LAYOUT, "pdf", "down", ALL)).toEqual([["materials"], ["notebook", "pdf"], ["assistant"]]);
    expect(moveSection(DEFAULT_LAYOUT, "notebook", "up", NO_PDF)).toBeNull();
    expect(moveSection(DEFAULT_LAYOUT, "materials", "up", ALL)).toBeNull();
  });

  it("has nowhere to go at the edges", () => {
    expect(moveSection([["materials"], ["pdf", "notebook", "assistant"]], "materials", "left", ALL)).toBeNull();
    expect(moveSection(DEFAULT_LAYOUT, "assistant", "right", ALL)).toBeNull();
  });

  it("jumps past a full neighbouring column instead of overfilling it", () => {
    const layout = [["materials", "pdf", "notebook"], ["assistant"]];
    expect(moveSection(layout, "assistant", "left", ALL)).toEqual([["assistant"], ["materials", "pdf", "notebook"]]);
  });
});

describe("grid geometry", () => {
  it("matches the original three-column layout by default, with the PDF/notebook divider", () => {
    const grid = computeGrid(DEFAULT_LAYOUT, { visible: ALL, pdfShare: 0.5 });
    expect(grid.columns.map((column) => column.track)).toEqual([
      "var(--ws-materials-w)",
      "minmax(0, 1fr)",
      "var(--ws-assistant-w)",
    ]);
    expect(grid.rows).toEqual(["minmax(0, 0.5fr)", "minmax(0, 0.5fr)"]);
    expect(grid.place.materials).toMatchObject({ column: 1, rowStart: 1, rowEnd: 3 });
    expect(grid.place.pdf).toMatchObject({ column: 2, rowStart: 1, rowEnd: 2 });
    expect(grid.place.notebook).toMatchObject({ column: 2, rowStart: 2, rowEnd: 3 });
    expect(grid.divider).toMatchObject({ column: 2, upper: "pdf", lower: "notebook", rowStart: 2 });
  });

  it("skips the PDF when it is closed, and sizes the PDF/notebook pair by its share", () => {
    expect(computeGrid(DEFAULT_LAYOUT, { visible: NO_PDF }).place.pdf).toBeUndefined();
    expect(computeGrid(DEFAULT_LAYOUT, { visible: NO_PDF }).divider).toBeNull();
    const below = computeGrid([["materials"], ["notebook", "pdf"], ["assistant"]], { visible: ALL, pdfShare: 0.7 });
    expect(below.rows).toEqual(["minmax(0, 0.3fr)", "minmax(0, 0.7fr)"]);
    expect(below.divider).toMatchObject({ upper: "notebook", lower: "pdf" });
  });

  it("lines up stacks of different heights and gives a stacked, collapsed materials bar its own row", () => {
    const layout = [["materials", "assistant"], ["pdf", "notebook"]];
    const grid = computeGrid(layout, { visible: ALL, materialsCollapsed: true, pdfShare: 0.5 });
    expect(grid.rows[0]).toBe("auto");
    expect(grid.place.materials).toMatchObject({ rowStart: 1, rowEnd: 2, compact: true });
    expect(grid.place.assistant).toMatchObject({ rowStart: 2, rowEnd: 4 });
    expect(grid.place.pdf.rowStart).toBe(1); // covers the auto row too
    expect(grid.columns[0].track).toBe("var(--ws-assistant-w)");
  });

  it("computes the narrowest usable width", () => {
    const grid = computeGrid(DEFAULT_LAYOUT, { visible: ALL });
    const sizes = { materials: 280, assistant: 340, flexMin: 320, gap: 16, padding: 16 };
    expect(minimumWidth(grid.columns, sizes)).toBe(280 + 320 + 340 + 32 + 32);
  });
});
