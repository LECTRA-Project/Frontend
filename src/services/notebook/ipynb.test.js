import { describe, expect, it } from "vitest";

import { fileNameForTitle, notebookToIpynb, parseIpynb, serializeNotebook, titleFromFileName } from "./ipynb.js";

const JUPYTER_FILE = {
  nbformat: 4,
  nbformat_minor: 4,
  metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, custom: { a: 1 } },
  cells: [
    { cell_type: "markdown", id: "intro", metadata: {}, source: ["# Title\n", "Some *text*"] },
    {
      cell_type: "code",
      metadata: { tags: ["x"] },
      execution_count: 3,
      source: "print('a')\n1 + 1",
      outputs: [
        { output_type: "stream", name: "stdout", text: ["a\n"] },
        { output_type: "execute_result", execution_count: 3, metadata: {}, data: { "text/plain": ["2"], "image/png": "iVBORw0=" } },
        { output_type: "error", ename: "ValueError", evalue: "bad", traceback: ["\u001b[31mValueError\u001b[0m: bad"] },
        { output_type: "unknown_kind" },
      ],
    },
    { cell_type: "raw", metadata: {}, source: "raw text" },
  ],
};

describe("parseIpynb", () => {
  it("reads cells, joins multi-line text and keeps metadata", () => {
    const notebook = parseIpynb(JSON.stringify(JUPYTER_FILE), { title: "Lecture" });

    expect(notebook.title).toBe("Lecture");
    expect(notebook.metadata.custom).toEqual({ a: 1 });
    expect(notebook.cells.map((cell) => cell.cell_type)).toEqual(["markdown", "code", "raw"]);
    expect(notebook.cells[0]).toMatchObject({ id: "intro", source: "# Title\nSome *text*" });

    const code = notebook.cells[1];
    expect(code.execution_count).toBe(3);
    expect(code.metadata).toEqual({ tags: ["x"] });
    expect(code.outputs).toEqual([
      { output_type: "stream", name: "stdout", text: "a\n" },
      { output_type: "execute_result", execution_count: 3, metadata: {}, data: { "text/plain": "2", "image/png": "iVBORw0=" } },
      { output_type: "error", ename: "ValueError", evalue: "bad", traceback: ["\u001b[31mValueError\u001b[0m: bad"] },
    ]);
    expect(code.id).toMatch(/^[a-zA-Z0-9-_]+$/); // generated when the file has none
  });

  it("gives duplicate cell ids new ones", () => {
    const file = { ...JUPYTER_FILE, cells: [JUPYTER_FILE.cells[0], JUPYTER_FILE.cells[0]] };
    const [first, second] = parseIpynb(JSON.stringify(file)).cells;
    expect(first.id).toBe("intro");
    expect(second.id).not.toBe("intro");
  });

  it.each([
    ["{ nope", /not valid JSON/],
    [JSON.stringify({ hello: 1 }), /no list of cells/],
    [JSON.stringify({ nbformat: 3, cells: [] }), /format 4/],
    [JSON.stringify({ nbformat: 4, cells: [{ cell_type: "widget" }] }), /Cell 1 has an unknown type/],
  ])("rejects %s with a readable message", (text, message) => {
    expect(() => parseIpynb(text)).toThrow(message);
  });
});

describe("notebookToIpynb", () => {
  it("round-trips a Jupyter file", () => {
    const notebook = parseIpynb(JSON.stringify(JUPYTER_FILE));
    const again = parseIpynb(serializeNotebook(notebook));
    expect(again.cells).toEqual(notebook.cells);
  });

  it("writes nbformat 4.5 with line arrays, base64 images and a Python kernelspec", () => {
    const notebook = {
      title: "t",
      metadata: {},
      cells: [
        {
          id: "c1",
          cell_type: "code",
          source: "a = 1\nprint(a)",
          metadata: {},
          execution_count: 1,
          outputs: [{ output_type: "display_data", metadata: {}, data: { "image/png": "AAAA", "text/plain": "<Figure>\n" } }],
        },
        { id: "m1", cell_type: "markdown", source: "", metadata: {} },
      ],
    };
    const file = notebookToIpynb(notebook, { pythonVersion: "3.14.2" });

    expect(file).toMatchObject({ nbformat: 4, nbformat_minor: 5 });
    expect(file.metadata.kernelspec.name).toBe("python3");
    expect(file.metadata.language_info).toEqual({ name: "python", version: "3.14.2" });
    expect(file.cells[0].source).toEqual(["a = 1\n", "print(a)"]);
    expect(file.cells[0].outputs[0].data).toEqual({ "image/png": "AAAA", "text/plain": ["<Figure>\n"] });
    expect(file.cells[1]).toEqual({ id: "m1", cell_type: "markdown", metadata: {}, source: [] });
    expect(file.cells[1]).not.toHaveProperty("outputs");
  });
});

describe("file names", () => {
  it("derives a title from a file name and back", () => {
    expect(titleFromFileName("Week 3.ipynb")).toBe("Week 3");
    expect(titleFromFileName(".ipynb")).toBe("Untitled notebook");
    expect(fileNameForTitle('a/b:c?"')).toBe("a-b-c-.ipynb");
    expect(fileNameForTitle("  ")).toBe("notebook.ipynb");
  });
});
