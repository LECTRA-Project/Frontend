/*
  The kinds of course material, with the file extensions a student can upload for each.
  The extensions are exactly the ones the backend accepts (POST upload-lecture answers 422
  for anything else): PDF, PPTX, IPYNB and PNG / JPG / JPEG / GIF / WEBP images.
  Markdown notes can't be uploaded, but the type is kept so a notes lecture still opens.
*/
export const MATERIAL_GROUPS = [
  { type: "pdf", label: "PDFs", short: "PDF", icon: "fileText", extensions: ["pdf"] },
  { type: "slides", label: "Slides", short: "Slides", icon: "slides", extensions: ["pptx"] },
  { type: "notebook", label: "Notebook", short: "Notebook", icon: "notebook", extensions: ["ipynb"] },
  { type: "image", label: "Images", short: "Image", icon: "image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
  { type: "notes", label: "Lecture notes", short: "Notes", icon: "book", extensions: [] },
];

/* For <input type="file" accept>. */
export const ACCEPTED_EXTENSIONS = MATERIAL_GROUPS.flatMap((group) => group.extensions.map((ext) => `.${ext}`)).join(",");

/* A readable list for help text: "PDF, PPTX, IPYNB and images (PNG, JPG, JPEG, GIF, WEBP)". */
export const SUPPORTED_LABEL = (() => {
  const upper = (group) => group.extensions.map((ext) => ext.toUpperCase());
  const files = MATERIAL_GROUPS.filter((group) => group.type !== "image").flatMap(upper);
  const images = upper(MATERIAL_GROUPS.find((group) => group.type === "image"));
  return `${files.join(", ")} and images (${images.join(", ")})`;
})();

function extensionOf(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/* "pdf" | "slides" | "notebook" | "image" for a file that can be uploaded, else null. */
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
