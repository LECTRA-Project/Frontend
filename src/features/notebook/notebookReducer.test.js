import { describe, expect, it } from "vitest";

import { initialNotebookState, notebookReducer } from "./notebookReducer.js";

const code = (id, source = "") => ({ id, cell_type: "code", source, metadata: {}, outputs: [], execution_count: null });

function stateWith(...cells) {
  return initialNotebookState({ title: "t", metadata: {}, cells });
}

const ids = (state) => state.notebook.cells.map((cell) => cell.id);

describe("notebookReducer", () => {
  it("inserts, edits, moves and deletes cells, counting saved changes", () => {
    let state = stateWith(code("a"), code("b"));
    state = notebookReducer(state, { type: "insert", cell: code("c"), index: 1 });
    expect(ids(state)).toEqual(["a", "c", "b"]);

    state = notebookReducer(state, { type: "edit", id: "c", source: "print(1)" });
    expect(state.notebook.cells[1].source).toBe("print(1)");

    state = notebookReducer(state, { type: "move", id: "c", offset: -1 });
    expect(ids(state)).toEqual(["c", "a", "b"]);
    expect(ids(notebookReducer(state, { type: "move", id: "c", offset: -1 }))).toEqual(["c", "a", "b"]);

    state = notebookReducer(state, { type: "delete", id: "a" });
    expect(ids(state)).toEqual(["c", "b"]);
    expect(state.changeId).toBe(4);
  });

  it("tracks a run: queued → running (old output cleared) → finished with its count", () => {
    let state = stateWith({ ...code("a", "1"), outputs: [{ output_type: "stream", name: "stdout", text: "old" }] });
    state = notebookReducer(state, { type: "queue", ids: ["a"] });
    expect(state.runState).toEqual({ a: "queued" });

    state = notebookReducer(state, { type: "start", id: "a" });
    expect(state.runState).toEqual({ a: "running" });
    expect(state.notebook.cells[0].outputs).toEqual([]);

    state = notebookReducer(state, { type: "output", id: "a", output: { output_type: "stream", name: "stdout", text: "1\n" } });
    state = notebookReducer(state, { type: "output", id: "a", output: { output_type: "stream", name: "stdout", text: "2\n" } });
    state = notebookReducer(state, { type: "output", id: "a", output: { output_type: "stream", name: "stderr", text: "w\n" } });
    expect(state.notebook.cells[0].outputs).toEqual([
      { output_type: "stream", name: "stdout", text: "1\n2\n" },
      { output_type: "stream", name: "stderr", text: "w\n" },
    ]);

    state = notebookReducer(state, { type: "finish", id: "a", executionCount: 4 });
    expect(state.runState).toEqual({});
    expect(state.notebook.cells[0].execution_count).toBe(4);
  });

  it("converts between code and Markdown, dropping outputs", () => {
    let state = stateWith({ ...code("a", "# hi"), outputs: [{ output_type: "stream", name: "stdout", text: "x" }], execution_count: 2 });
    state = notebookReducer(state, { type: "convert", id: "a", cellType: "markdown" });
    expect(state.notebook.cells[0]).toEqual({ id: "a", cell_type: "markdown", source: "# hi", metadata: {} });

    state = notebookReducer(state, { type: "convert", id: "a", cellType: "code" });
    expect(state.notebook.cells[0]).toMatchObject({ cell_type: "code", outputs: [], execution_count: null });
  });

  it("clears outputs of one cell or all cells", () => {
    const withOutput = (id) => ({ ...code(id, "1"), outputs: [{ output_type: "stream", name: "stdout", text: "1" }], execution_count: 1 });
    let state = stateWith(withOutput("a"), withOutput("b"));

    state = notebookReducer(state, { type: "clearOutputs", id: "a" });
    expect(state.notebook.cells.map((cell) => cell.outputs.length)).toEqual([0, 1]);

    state = notebookReducer(state, { type: "clearAllOutputs" });
    expect(state.notebook.cells.every((cell) => cell.outputs.length === 0 && cell.execution_count === null)).toBe(true);
  });
});
