import { afterEach, describe, expect, it } from "vitest";

import {
  computeGrid,
  DEFAULT_LAYOUT,
  isValidLayout,
  loadLayout,
  minimumWidth,
  moveSection,
  placeSection,
  resizeColumns,
  saveLayout,
} from "./sectionLayout.js";

// The earlier default (PDF stacked over the notebook): the move tests below start from it.
const STACKED = [["materials"], ["pdf", "notebook"], ["assistant"]];

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

    localStorage.setItem("lectra:workspace-layout:v2:u3", "{ broken");
    expect(loadLayout("u3")).toEqual(DEFAULT_LAYOUT);
    localStorage.setItem("lectra:workspace-layout:v2:u4", JSON.stringify([["materials"], ["notebook"]]));
    expect(loadLayout("u4")).toEqual(DEFAULT_LAYOUT);

    saveLayout("u1", DEFAULT_LAYOUT); // the default is stored as "nothing saved"
    expect(localStorage.getItem("lectra:workspace-layout:v2:u1")).toBeNull();
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
    expect(placeSection(STACKED, id, target, edge)).toEqual(expected);
  });

  it("rejects drops that change nothing, target itself, or overfill a column", () => {
    expect(placeSection(STACKED, "pdf", "notebook", "top")).toBeNull(); // already there
    expect(placeSection(STACKED, "pdf", "pdf", "left")).toBeNull();
    expect(placeSection(STACKED, "pdf", "notebook", "middle")).toBeNull();
    const full = [["materials", "pdf", "notebook"], ["assistant"]];
    expect(placeSection(full, "assistant", "pdf", "top")).toBeNull();
  });
});

describe("keyboard moves", () => {
  it("steps a section left: join the neighbouring column, then split out past it", () => {
    const joined = moveSection(STACKED, "assistant", "left", ALL);
    expect(joined).toEqual([["materials"], ["pdf", "notebook", "assistant"]]);
    expect(moveSection(joined, "assistant", "left", ALL)).toEqual([["materials"], ["assistant"], ["pdf", "notebook"]]);
  });

  it("moves up and down within a column, skipping sections that aren't shown", () => {
    expect(moveSection(STACKED, "pdf", "down", ALL)).toEqual([["materials"], ["notebook", "pdf"], ["assistant"]]);
    expect(moveSection(STACKED, "notebook", "up", NO_PDF)).toBeNull();
    expect(moveSection(STACKED, "materials", "up", ALL)).toBeNull();
  });

  it("has nowhere to go at the edges", () => {
    expect(moveSection([["materials"], ["pdf", "notebook", "assistant"]], "materials", "left", ALL)).toBeNull();
    expect(moveSection(STACKED, "assistant", "right", ALL)).toBeNull();
  });

  it("jumps past a full neighbouring column instead of overfilling it", () => {
    const layout = [["materials", "pdf", "notebook"], ["assistant"]];
    expect(moveSection(layout, "assistant", "left", ALL)).toEqual([["assistant"], ["materials", "pdf", "notebook"]]);
  });
});

describe("grid geometry", () => {
  it("puts the PDF, notebook and assistant side by side by default", () => {
    const grid = computeGrid(DEFAULT_LAYOUT, { visible: ALL });
    expect(grid.columns.map((column) => column.track)).toEqual([
      "var(--ws-materials-w)",
      "minmax(0, 1fr)",
      "minmax(0, 1fr)",
      "var(--ws-assistant-w)",
    ]);
    expect(grid.rows).toEqual(["minmax(0, 1fr)"]);
    expect([grid.place.pdf.column, grid.place.notebook.column, grid.place.assistant.column]).toEqual([2, 3, 4]);
    expect(grid.divider).toBeNull();
    // With the PDF closed, the notebook takes its place.
    expect(computeGrid(DEFAULT_LAYOUT, { visible: NO_PDF }).columns).toHaveLength(3);
  });

  it("sizes columns from the dividers: px for materials / assistant, flex weights for PDF / notebook", () => {
    const widths = { materials: 300, assistant: 420, pdf: 1.5, notebook: 0.5 };
    const grid = computeGrid(DEFAULT_LAYOUT, { visible: ALL, widths });
    expect(grid.columns.map((column) => column.track)).toEqual(["300px", "minmax(0, 1.5fr)", "minmax(0, 0.5fr)", "420px"]);
  });

  it("resizes neighbouring columns within their limits", () => {
    const fixed = (key, width) => ({ key, flex: false, width });
    const flex = (key, width) => ({ key, flex: true, width });
    // Materials | PDF: the materials column gets a px width, clamped to 200…640.
    expect(resizeColumns({}, fixed("materials", 280), flex("pdf", 500), 40)).toEqual({ materials: 320 });
    expect(resizeColumns({}, fixed("materials", 280), flex("pdf", 500), -500)).toEqual({ materials: 200 });
    // Notebook | assistant: dragging right makes the assistant narrower.
    expect(resizeColumns({}, flex("notebook", 500), fixed("assistant", 340), 40)).toEqual({ assistant: 300 });
    // PDF | notebook: their flex weights follow the new widths; neither goes below 240 px.
    expect(resizeColumns({}, flex("pdf", 500), flex("notebook", 500), 100)).toEqual({ pdf: 1.2, notebook: 0.8 });
    expect(resizeColumns({}, flex("pdf", 500), flex("notebook", 500), 900)).toEqual({ pdf: 1.52, notebook: 0.48 });
  });

  it("keeps the PDF/notebook divider when they are stacked in one column", () => {
    const grid = computeGrid(STACKED, { visible: ALL, pdfShare: 0.5 });
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
    expect(computeGrid(STACKED, { visible: NO_PDF }).place.pdf).toBeUndefined();
    expect(computeGrid(STACKED, { visible: NO_PDF }).divider).toBeNull();
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
    const sizes = { materials: 280, assistant: 340, flexMin: 240, gap: 16, padding: 16 };
    expect(minimumWidth(computeGrid(STACKED, { visible: ALL }).columns, sizes)).toBe(280 + 240 + 340 + 32 + 32);
    expect(minimumWidth(computeGrid(DEFAULT_LAYOUT, { visible: ALL }).columns, sizes)).toBe(280 + 240 + 240 + 340 + 48 + 32);
    // A resized column counts with its width.
    const wide = computeGrid(DEFAULT_LAYOUT, { visible: ALL, widths: { assistant: 500 } });
    expect(minimumWidth(wide.columns, sizes)).toBe(280 + 240 + 240 + 500 + 48 + 32);
  });
});
