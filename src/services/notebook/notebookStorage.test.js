import { afterEach, describe, expect, it, vi } from "vitest";

import { loadNotebook, saveNotebook } from "./notebookStorage.js";

const notebook = {
  title: "My notes",
  metadata: {},
  cells: [{ id: "a", cell_type: "code", source: "x = 1", metadata: {}, execution_count: 1, outputs: [] }],
};

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("notebookStorage", () => {
  it("saves and restores a notebook per user", () => {
    const savedAt = saveNotebook("user-1", notebook);

    const restored = loadNotebook("user-1");
    expect(restored.savedAt).toBe(savedAt);
    expect(restored.notebook.title).toBe("My notes");
    expect(restored.notebook.cells).toEqual(notebook.cells);
    expect(loadNotebook("user-2")).toBeNull();
  });

  it("explains a full browser storage", () => {
    // Spy on the prototype: newer jsdom versions ignore a spy on the localStorage instance.
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveNotebook("user-1", notebook)).toThrow(/Browser storage is full/);
    spy.mockRestore();
  });

  it("throws on unreadable saved data instead of silently dropping it", () => {
    localStorage.setItem("lectra:notebook:v1:user-1", "{ broken");
    expect(() => loadNotebook("user-1")).toThrow();
  });
});
