/*
  DEMO course materials shown in the Course Materials panel.
  These are names only, taken from the Figma design — there are no real files or
  document contents behind them. Later, this list will come from the backend.

  type:  "notes" | "slides" | "pdf" | "notebook"
  pages: only used by the PDF viewer for its page count (demo value)
*/
export const MATERIAL_GROUPS = [
  { type: "notes", label: "Lecture notes", icon: "book" },
  { type: "slides", label: "Slides", icon: "slides" },
  { type: "pdf", label: "PDFs", icon: "fileText" },
  { type: "notebook", label: "Notebook", icon: "notebook" },
];

export const SAMPLE_MATERIALS = [
  { id: "notes-01", type: "notes", name: "Lecture 01 — Notes", meta: "Notes" },
  { id: "notes-02", type: "notes", name: "Lecture 02 — Notes", meta: "Notes" },
  { id: "slides-01", type: "slides", name: "Lecture 01 — Slides", meta: "Slides · PPTX" },
  { id: "pdf-01", type: "pdf", name: "Reading_01.pdf", meta: "PDF · 12 pages", pages: 12 },
  { id: "pdf-02", type: "pdf", name: "Reading_02.pdf", meta: "PDF · 8 pages", pages: 8 },
  { id: "notebook-01", type: "notebook", name: "Study notebook.ipynb", meta: "Notebook · open" },
];
