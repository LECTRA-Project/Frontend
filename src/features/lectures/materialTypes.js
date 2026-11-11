/*
  How backend lectures are shown in the workspace.

  Groups, accepted extensions and file-size formatting come from
  services/materials/materialTypes.js (one source of truth for the whole app).

  type:   "pdf" | "slides" | "notebook" | "notes" | "image" — picks the group, icon and viewer.
  status: the student-facing processing state:
    "uploading" (only in the browser, while the file is sent)
    "processing" (backend: pending or processing)
    "completed" | "failed" | "skipped" (images are stored but not searchable)
*/
import { materialTypeOf } from "../../services/materials/materialTypes.js";

const TYPE_BY_MIME = {
  "application/pdf": "pdf",
  "application/vnd.ms-powerpoint": "slides",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "slides",
  "application/x-ipynb+json": "notebook",
  "text/markdown": "notes",
};

const FORMAT_LABEL = {
  "application/pdf": "PDF",
  "application/vnd.ms-powerpoint": "PPT",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "application/x-ipynb+json": "Notebook",
  "text/markdown": "Notes",
};

const UNIT = { page: ["page", "pages"], slide: ["slide", "slides"], cell: ["cell", "cells"], section: ["section", "sections"] };

export const STATUS_LABEL = {
  uploading: "Uploading",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  skipped: "Not searchable",
};

export function materialType(fileType) {
  return TYPE_BY_MIME[fileType] ?? "image";
}

export function displayStatus(processingStatus) {
  return processingStatus === "pending" || processingStatus === "processing" ? "processing" : processingStatus;
}

export function isInProgress(lecture) {
  return lecture.processing_status === "pending" || lecture.processing_status === "processing";
}

export function titleFromFileName(name) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return (base || name).slice(0, 255);
}

export function hasAcceptedExtension(name) {
  return materialTypeOf(name) !== null;
}

/* "PDF · 12 pages · AI Basics" */
export function lectureMeta(lecture) {
  const parts = [FORMAT_LABEL[lecture.file_type] ?? "Image"];
  const unit = UNIT[lecture.source_type];
  if (unit && lecture.source_count) parts.push(`${lecture.source_count} ${unit[lecture.source_count === 1 ? 0 : 1]}`);
  if (lecture.course) parts.push(lecture.course);
  return parts.join(" · ");
}

/* A backend lecture → the item shape the materials panel renders. */
export function toMaterial(lecture) {
  return {
    id: lecture.id,
    type: materialType(lecture.file_type),
    name: lecture.title,
    meta: lectureMeta(lecture),
    status: displayStatus(lecture.processing_status),
    error: lecture.processing_error,
    pages: lecture.source_type === "page" ? lecture.source_count : undefined,
    size: lecture.file_size,
    lecture,
  };
}
