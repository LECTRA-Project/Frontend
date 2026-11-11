/*
  Notebook cells added to a Study Assistant question as context.

  A context item is a snapshot of one cell when it was added:
    { id, cellId, cellType: "code" | "markdown" | "raw", position (1-based), source, notebookTitle }
  The source is kept complete (indentation and line breaks included). It is only ever
  shown and sent as text — adding or sending a cell never runs it.
*/

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

/* "Python cell 3" */
export function cellContextLabel(item) {
  return `${TYPE_LABELS[item.cellType] ?? "Notebook"} cell ${item.position}`;
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

/* The structured form passed to the Study Assistant service. */
export function toAssistantContext(item) {
  return {
    kind: "notebook-cell",
    cellType: item.cellType,
    position: item.position,
    notebookTitle: item.notebookTitle,
    source: item.source,
  };
}
