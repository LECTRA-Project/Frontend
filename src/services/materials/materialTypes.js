/*
  The kinds of course material a student can upload, and how each is grouped in the
  Course Materials panel. Groups only appear when they contain uploaded files.
  Images cannot be uploaded from the app (no extensions) but lectures uploaded as
  images through the API are still listed.
*/
export const MATERIAL_GROUPS = [
  { type: "notes", label: "Lecture notes", short: "Notes", icon: "book", extensions: ["md"] },
  { type: "slides", label: "Slides", short: "Slides", icon: "slides", extensions: ["pptx", "ppt"] },
  { type: "pdf", label: "PDFs", short: "PDF", icon: "fileText", extensions: ["pdf"] },
  { type: "notebook", label: "Notebook", short: "Notebook", icon: "notebook", extensions: ["ipynb"] },
  { type: "image", label: "Images", short: "Image", icon: "book", extensions: [] },
];

/* For <input type="file" accept>. */
export const ACCEPTED_EXTENSIONS = MATERIAL_GROUPS.flatMap((group) => group.extensions.map((ext) => `.${ext}`)).join(",");

/* A readable list for help text: "PDF, PPTX, IPYNB and MD". */
export const SUPPORTED_LABEL = (() => {
  const names = MATERIAL_GROUPS.flatMap((group) => group.extensions).map((ext) => ext.toUpperCase());
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
})();

function extensionOf(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/* "pdf" | "slides" | "notebook" | "notes", or null if the file type is not supported. */
export function materialTypeOf(fileName) {
  const extension = extensionOf(fileName);
  return MATERIAL_GROUPS.find((group) => group.extensions.includes(extension))?.type ?? null;
}

export function groupOf(type) {
  return MATERIAL_GROUPS.find((group) => group.type === type);
}

/* 1536 → "1.5 KB" */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
