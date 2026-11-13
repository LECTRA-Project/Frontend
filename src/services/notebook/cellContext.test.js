import { describe, expect, it } from "vitest";

import { displayChatTitle, parseNotebookContext, withNotebookContext } from "./cellContext.js";

const CODE = "def f(x):\n    return x\n\n\n\tprint(f(2))  # blank lines and a tab";
const MARKDOWN = "# Notes\n\n- a\n- b";

describe("parseNotebookContext", () => {
  it("reads back the question and every cell exactly as withNotebookContext wrote them", () => {
    const content = withNotebookContext("Why does this fail?\nSecond line", [
      { cellType: "code", position: 3, source: CODE, notebookTitle: "Week 5" },
      { cellType: "markdown", position: 4, source: MARKDOWN, notebookTitle: "" },
    ]);
    expect(parseNotebookContext(content)).toEqual({
      text: "Why does this fail?\nSecond line",
      cells: [
        { label: "Python cell 3", cellType: "code", position: 3, notebookTitle: "Week 5", source: CODE },
        { label: "Markdown cell 4", cellType: "markdown", position: 4, notebookTitle: "", source: MARKDOWN },
      ],
    });
  });

  it("leaves a question without cells as it is", () => {
    expect(parseNotebookContext("What is A*?")).toEqual({ text: "What is A*?", cells: [] });
    expect(parseNotebookContext("")).toEqual({ text: "", cells: [] });
  });
});

describe("displayChatTitle", () => {
  it("drops the notebook block from titles the backend made from a question with cells", () => {
    expect(displayChatTitle("What do these notes mean? Notebook context (cells I added…")).toBe("What do these notes mean?");
    expect(displayChatTitle("Why? Notebook context…")).toBe("Why?");
    expect(displayChatTitle("Explain this loop please Notebook…")).toBe("Explain this loop please");
  });

  it("keeps ordinary titles", () => {
    expect(displayChatTitle("How do I open a Notebook")).toBe("How do I open a Notebook");
    expect(displayChatTitle("New chat")).toBe("New chat");
    expect(displayChatTitle(undefined)).toBeUndefined();
  });
});
