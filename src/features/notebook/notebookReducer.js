import { createCell } from "../../services/notebook/ipynb.js";

/*
  All changes to the open notebook go through this reducer.

  State:
    notebook   { title, metadata, cells }  (see services/notebook/ipynb.js)
    runState   { [cellId]: "queued" | "running" }  — not saved
    changeId   increases with every change that should be saved
*/
export function initialNotebookState(notebook) {
  return { notebook, runState: {}, changeId: 0 };
}

function updateCells(state, update) {
  return { ...state, notebook: { ...state.notebook, cells: update(state.notebook.cells) }, changeId: state.changeId + 1 };
}

function updateCell(state, id, update) {
  return updateCells(state, (cells) => cells.map((cell) => (cell.id === id ? update(cell) : cell)));
}

function withoutRunState(runState, ids) {
  const next = { ...runState };
  ids.forEach((id) => delete next[id]);
  return next;
}

/* Appends an output, merging consecutive stream text of the same stream like Jupyter does. */
function appendOutput(outputs, output) {
  const last = outputs[outputs.length - 1];
  if (output.output_type === "stream" && last?.output_type === "stream" && last.name === output.name) {
    return [...outputs.slice(0, -1), { ...last, text: last.text + output.text }];
  }
  return [...outputs, output];
}

export function notebookReducer(state, action) {
  switch (action.type) {
    case "replace":
      return { notebook: action.notebook, runState: {}, changeId: state.changeId + 1 };

    case "rename":
      return { ...state, notebook: { ...state.notebook, title: action.title }, changeId: state.changeId + 1 };

    case "insert": {
      const cell = action.cell ?? createCell(action.cellType);
      return updateCells(state, (cells) => {
        const index = action.index ?? cells.length;
        return [...cells.slice(0, index), cell, ...cells.slice(index)];
      });
    }

    case "edit":
      return updateCell(state, action.id, (cell) => ({ ...cell, source: action.source }));

    case "delete":
      return {
        ...updateCells(state, (cells) => cells.filter((cell) => cell.id !== action.id)),
        runState: withoutRunState(state.runState, [action.id]),
      };

    case "move":
      return updateCells(state, (cells) => {
        const from = cells.findIndex((cell) => cell.id === action.id);
        const to = from + action.offset;
        if (from < 0 || to < 0 || to >= cells.length) return cells;
        const next = [...cells];
        const [cell] = next.splice(from, 1);
        next.splice(to, 0, cell);
        return next;
      });

    case "convert":
      return updateCell(state, action.id, (cell) => {
        if (cell.cell_type === action.cellType) return cell;
        const converted = { id: cell.id, cell_type: action.cellType, source: cell.source, metadata: cell.metadata };
        if (action.cellType === "code") {
          converted.outputs = [];
          converted.execution_count = null;
        }
        return converted;
      });

    case "clearOutputs":
      return updateCell(state, action.id, (cell) =>
        cell.cell_type === "code" ? { ...cell, outputs: [], execution_count: null } : cell
      );

    case "clearAllOutputs":
      return updateCells(state, (cells) =>
        cells.map((cell) => (cell.cell_type === "code" ? { ...cell, outputs: [], execution_count: null } : cell))
      );

    case "queue": {
      const runState = { ...state.runState };
      action.ids.forEach((id) => {
        if (!runState[id]) runState[id] = "queued";
      });
      return { ...state, runState };
    }

    case "unqueue":
      return { ...state, runState: withoutRunState(state.runState, action.ids) };

    case "start":
      return {
        ...updateCell(state, action.id, (cell) => ({ ...cell, outputs: [] })),
        runState: { ...state.runState, [action.id]: "running" },
      };

    case "output":
      return updateCell(state, action.id, (cell) => ({ ...cell, outputs: appendOutput(cell.outputs, action.output) }));

    case "finish":
      return {
        ...updateCell(state, action.id, (cell) => ({ ...cell, execution_count: action.executionCount })),
        runState: withoutRunState(state.runState, [action.id]),
      };

    default:
      throw new Error(`Unknown notebook action: ${action.type}`);
  }
}
