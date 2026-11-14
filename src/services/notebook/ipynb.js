/*
  Conversion between LECTRA's notebook model and Jupyter's .ipynb format (nbformat 4).

  In memory a notebook is:
    { title, metadata, cells: [Cell] }
    Cell = { id, cell_type: "code" | "markdown" | "raw", source: string, metadata, attachments?,
             outputs: [Output], execution_count: number | null }   (outputs/execution_count: code only)
    Output = Jupyter output dict with every multi-line text joined into one string.

  .ipynb files split text into arrays of lines; parseIpynb joins them and
  notebookToIpynb splits them again, so files round-trip.
*/

import { t } from "../../i18n/i18n.js";

export const NBFORMAT = 4;
export const NBFORMAT_MINOR = 5;
const CELL_TYPES = ["code", "markdown", "raw"];
const VALID_ID = /^[a-zA-Z0-9-_]{1,64}$/;

export class NotebookFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotebookFormatError";
  }
}

export function newCellId() {
  return crypto.randomUUID();
}

export function createCell(cellType, source = "") {
  const cell = { id: newCellId(), cell_type: cellType, source, metadata: {} };
  if (cellType === "code") {
    cell.outputs = [];
    cell.execution_count = null;
  }
  return cell;
}

export function createNotebook(title = "Untitled notebook") {
  return { title, metadata: {}, cells: [] };
}

/* "My notes.ipynb" → "My notes" */
export function titleFromFileName(fileName) {
  return fileName.replace(/\.ipynb$/i, "").trim() || "Untitled notebook";
}

/* A safe download name for the notebook's title. */
export function fileNameForTitle(title) {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, "-") || "notebook";
  return `${base}.ipynb`;
}

function joinText(value) {
  if (Array.isArray(value)) return value.join("");
  return typeof value === "string" ? value : "";
}

function splitLines(text) {
  if (!text) return [];
  return text.split(/(?<=\n)/);
}

/* JSON mime types (application/json, …+json) hold objects; everything else is text. */
function isJsonMime(mime) {
  return mime === "application/json" || mime.endsWith("+json");
}

function readMimeBundle(data) {
  const bundle = {};
  for (const [mime, value] of Object.entries(data ?? {})) {
    bundle[mime] = isJsonMime(mime) ? value : joinText(value);
  }
  return bundle;
}

function writeMimeBundle(data) {
  const bundle = {};
  for (const [mime, value] of Object.entries(data ?? {})) {
    // Images are single base64 strings; other text is stored line by line, like Jupyter does.
    bundle[mime] = isJsonMime(mime) || mime.startsWith("image/") ? value : splitLines(value);
  }
  return bundle;
}

function readOutput(output) {
  switch (output?.output_type) {
    case "stream":
      return { output_type: "stream", name: output.name === "stderr" ? "stderr" : "stdout", text: joinText(output.text) };
    case "execute_result":
      return {
        output_type: "execute_result",
        execution_count: output.execution_count ?? null,
        data: readMimeBundle(output.data),
        metadata: output.metadata ?? {},
      };
    case "display_data":
      return { output_type: "display_data", data: readMimeBundle(output.data), metadata: output.metadata ?? {} };
    case "error":
      return {
        output_type: "error",
        ename: String(output.ename ?? "Error"),
        evalue: String(output.evalue ?? ""),
        traceback: Array.isArray(output.traceback) ? output.traceback.map(String) : [],
      };
    default:
      return null; // unknown output types are dropped
  }
}

function writeOutput(output) {
  switch (output.output_type) {
    case "stream":
      return { output_type: "stream", name: output.name, text: splitLines(output.text) };
    case "execute_result":
      return {
        output_type: "execute_result",
        execution_count: output.execution_count,
        data: writeMimeBundle(output.data),
        metadata: output.metadata ?? {},
      };
    case "display_data":
      return { output_type: "display_data", data: writeMimeBundle(output.data), metadata: output.metadata ?? {} };
    default:
      return { output_type: "error", ename: output.ename, evalue: output.evalue, traceback: output.traceback };
  }
}

/*
  Parses the text of an .ipynb file. Throws NotebookFormatError with a readable
  message if it is not a notebook LECTRA can open.
*/
export function parseIpynb(text, { title = "Untitled notebook" } = {}) {
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new NotebookFormatError(t("The file is not valid JSON ({error}).", { error: error.message }));
  }
  if (!json || typeof json !== "object" || !Array.isArray(json.cells)) {
    throw new NotebookFormatError(t("The file is not a Jupyter notebook: it has no list of cells."));
  }
  if (json.nbformat !== NBFORMAT) {
    throw new NotebookFormatError(
      json.nbformat == null
        ? t("Only Jupyter notebook format 4 is supported; this file uses format unknown.")
        : t("Only Jupyter notebook format 4 is supported; this file uses format {format}.", { format: json.nbformat })
    );
  }

  const usedIds = new Set();
  const cells = json.cells.map((raw, index) => {
    if (!CELL_TYPES.includes(raw?.cell_type)) {
      throw new NotebookFormatError(t("Cell {number} has an unknown type “{type}”.", { number: index + 1, type: raw?.cell_type }));
    }
    let id = typeof raw.id === "string" && VALID_ID.test(raw.id) ? raw.id : newCellId();
    if (usedIds.has(id)) id = newCellId();
    usedIds.add(id);

    const cell = { id, cell_type: raw.cell_type, source: joinText(raw.source), metadata: raw.metadata ?? {} };
    if (raw.attachments) cell.attachments = raw.attachments;
    if (raw.cell_type === "code") {
      cell.outputs = (Array.isArray(raw.outputs) ? raw.outputs : []).map(readOutput).filter(Boolean);
      cell.execution_count = Number.isInteger(raw.execution_count) ? raw.execution_count : null;
    }
    return cell;
  });

  return { title, metadata: json.metadata ?? {}, cells };
}

/* The notebook as an nbformat 4.5 object (JSON.stringify it to get the file). */
export function notebookToIpynb(notebook, { pythonVersion } = {}) {
  const metadata = {
    ...notebook.metadata,
    kernelspec: notebook.metadata?.kernelspec ?? {
      name: "python3",
      display_name: "Python 3 (Pyodide)",
      language: "python",
    },
    language_info: {
      ...notebook.metadata?.language_info,
      name: "python",
      ...(pythonVersion ? { version: pythonVersion } : {}),
    },
  };

  return {
    cells: notebook.cells.map((cell) => {
      const out = { id: cell.id, cell_type: cell.cell_type, metadata: cell.metadata ?? {}, source: splitLines(cell.source) };
      if (cell.attachments) out.attachments = cell.attachments;
      if (cell.cell_type === "code") {
        out.execution_count = cell.execution_count ?? null;
        out.outputs = (cell.outputs ?? []).map(writeOutput);
      }
      return out;
    }),
    metadata,
    nbformat: NBFORMAT,
    nbformat_minor: NBFORMAT_MINOR,
  };
}

export function serializeNotebook(notebook, options) {
  return `${JSON.stringify(notebookToIpynb(notebook, options), null, 1)}\n`;
}
