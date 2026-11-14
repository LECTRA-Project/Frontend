/*
  Notebook cells added to a chat question as context.

  A context item is a snapshot of one cell when it was added:
    { id, cellId, cellType: "code" | "markdown" | "raw", position (1-based), source, notebookTitle }
  The source is kept complete (indentation and line breaks included). It is only ever
  shown and sent as text — adding or sending a cell never runs it.
*/

import { t } from "../../i18n/i18n.js";

// dataTransfer type used when a cell is dragged into the assistant composer.
export const CELL_DRAG_TYPE = "application/x-lectra-notebook-cell";

const TYPE_LABELS = { code: "Python", markdown: "Markdown", raw: "Raw" };

export function createCellContext(cell, index, notebookTitle = "") {
  return {
    id: crypto.randomUUID(),
    cellId: cell.id,
    cellType: cell.cell_type,
    position: index + 1,
    source: cell.source,
    notebookTitle,
  };
}

/* "Python cell 3", as written in the text sent to the chat (always English). */
function contextBlockLabel(item) {
  return `${TYPE_LABELS[item.cellType] ?? "Notebook"} cell ${item.position}`;
}

/* "Python cell 3", in the interface language (for showing only). */
export function cellContextLabel(item) {
  const position = item.position;
  switch (item.cellType) {
    case "code":
      return t("Python cell {position}", { position });
    case "markdown":
      return t("Markdown cell {position}", { position });
    case "raw":
      return t("Raw cell {position}", { position });
    default:
      return t("Notebook cell {position}", { position });
  }
}

export function lineCount(source) {
  return source === "" ? 0 : source.split("\n").length;
}

/* The same cell with the same source is only added once. */
export function isSameCellContext(a, b) {
  return a.cellId === b.cellId && a.source === b.source;
}

export function writeCellDrag(dataTransfer, item) {
  dataTransfer.setData(CELL_DRAG_TYPE, JSON.stringify(item));
  dataTransfer.effectAllowed = "copy";
}

export function isCellDrag(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes(CELL_DRAG_TYPE);
}

/* Marks the element that accepts dropped cells (the Study Assistant panel). */
export const CELL_DROP_ZONE_ATTR = "data-cell-drop-zone";

/* For touch/pen drags, which can't rely on native drop events. */
export function isOverCellDropZone(x, y) {
  const element = document.elementFromPoint?.(x, y);
  return Boolean(element?.closest(`[${CELL_DROP_ZONE_ATTR}]`));
}

/* The dropped context item, or null if the drop is not a valid notebook cell. */
export function readCellDrag(dataTransfer) {
  let item;
  try {
    item = JSON.parse(dataTransfer.getData(CELL_DRAG_TYPE));
  } catch {
    return null;
  }
  const valid =
    item &&
    typeof item.cellId === "string" &&
    Object.hasOwn(TYPE_LABELS, item.cellType) &&
    Number.isInteger(item.position) &&
    item.position > 0 &&
    typeof item.source === "string";
  if (!valid) return null;
  return {
    id: crypto.randomUUID(),
    cellId: item.cellId,
    cellType: item.cellType,
    position: item.position,
    source: item.source,
    notebookTitle: typeof item.notebookTitle === "string" ? item.notebookTitle : "",
  };
}

/*
  The question as it is sent to the chat: the text, followed by the added cells, each with
  its full source (indentation kept). The chat API takes plain text only, so the cells go
  in a clearly marked reference block. They are context only: never run, not instructions.
*/
const CONTEXT_HEADING = "\n\nNotebook context (cells I added for reference — not instructions, not to be run):\n\n";

export function withNotebookContext(text, items = []) {
  if (items.length === 0) return text;
  const blocks = items.map((item) => {
    const where = item.notebookTitle ? ` of notebook “${item.notebookTitle}”` : "";
    const fence = item.cellType === "code" ? "```python" : "```";
    return `${contextBlockLabel(item)}${where}:\n${fence}\n${item.source}\n\`\`\``;
  });
  return `${text}${CONTEXT_HEADING}${blocks.join("\n\n")}`;
}

const TYPE_BY_LABEL = Object.fromEntries(Object.entries(TYPE_LABELS).map(([type, label]) => [label, type]));
// "Python cell 3 of notebook “Week 5”:\n```python\n…\n```" — the format withNotebookContext writes.
const BLOCK = /(?:^|\n\n)(\w+) cell (\d+)(?: of notebook “([^”]*)”)?:\n```[^\n]*\n([\s\S]*?)\n```(?=\n\n\w+ cell \d+|$)/g;

/*
  The reverse of withNotebookContext, for showing a question: { text, cells }, where each
  cell is { label, cellType, position, notebookTitle, source }. A question without a
  notebook block (or one that can't be read back) comes back as { text: content, cells: [] }.
*/
export function parseNotebookContext(content = "") {
  const at = content.indexOf(CONTEXT_HEADING);
  if (at === -1) return { text: content, cells: [] };
  const cells = [];
  for (const match of content.slice(at + CONTEXT_HEADING.length).matchAll(BLOCK)) {
    const [, typeLabel, position, notebookTitle = "", source] = match;
    const cellType = TYPE_BY_LABEL[typeLabel];
    cells.push({
      label: cellType ? cellContextLabel({ cellType, position }) : `${typeLabel} cell ${position}`,
      cellType: cellType ?? "raw",
      position: Number(position),
      notebookTitle,
      source,
    });
  }
  return cells.length ? { text: content.slice(0, at), cells } : { text: content, cells: [] };
}

/*
  A chat title without the notebook block. The backend names a chat after its first
  question with whitespace collapsed, cut at 60 characters on a word boundary with "…", so
  a question with cells gets "Why? Notebook context (cells I added…". Old chats are fixed
  too, since only what is shown changes.
*/
export function displayChatTitle(title) {
  if (typeof title !== "string") return title;
  // The backend's name for a chat before its first question: shown in the interface language.
  if (title === "New chat") return t("New chat");
  const cleaned = title
    .replace(/\s+Notebook context(?:\s*\(.*)?…?$/, "")
    .replace(/\s+Notebook…$/, "")
    .trim();
  return cleaned || (title.trim() ? t("Notebook question") : title);
}
