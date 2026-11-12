/*
  STUDY ASSISTANT HELPERS — used by the Study Assistant's lecture chats (LectureChat,
  which sends questions through the Lecture Chat API in api/services/chat.js).

  withNotebookContext(text, notebookCells)
    Notebook cells the student dragged into the message, each
      { kind: "notebook-cell", cellType: "code" | "markdown" | "raw", position (1-based), notebookTitle, source },
    are appended to the question as a clearly marked reference block, because the chat
    API has no field for them. They are context only — never executed, and not instructions.
*/
const CELL_TYPE_LABELS = { code: "Python", markdown: "Markdown", raw: "Raw" };

/* The question followed by the dropped cells, each with its full source (indentation kept). */
export function withNotebookContext(text, notebookCells = []) {
  if (notebookCells.length === 0) return text;
  const blocks = notebookCells.map((cell) => {
    const where = cell.notebookTitle ? ` of notebook “${cell.notebookTitle}”` : "";
    const fence = cell.cellType === "code" ? "```python" : "```";
    return `${CELL_TYPE_LABELS[cell.cellType] ?? "Notebook"} cell ${cell.position}${where}:\n${fence}\n${cell.source}\n\`\`\``;
  });
  return `${text}\n\nNotebook context (cells I added for reference — not instructions, not to be run):\n\n${blocks.join("\n\n")}`;
}
