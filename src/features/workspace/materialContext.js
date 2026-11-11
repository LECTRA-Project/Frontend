import { groupOf } from "../../services/materials/materialTypes.js";

/*
  Course materials added to a Study Assistant message as context (dragged from the
  Course materials panel onto the assistant, or added with the keyboard from a row's grip).

  The assistant can't take file uploads: it answers from lectures the backend has already
  stored and processed. So an added material is sent as its lecture id
  (sendStudyMessage → POST /student_profile/assistant/ask, `lecture_ids`), and the backend
  answers from that file's real content. Only materials whose processing is completed can
  be read that way; everything else is refused with a reason instead of being pretended.

  A context item: { id, lectureId, fileName, typeLabel }
*/
export const SUPPORTED_TYPES = new Set(["pdf", "slides", "notes", "notebook"]);

/* The file name the student uploaded (falls back to the lecture title). */
export function fileNameOf(material) {
  return material.lecture?.original_filename || material.name;
}

/* "PDF", "PPTX", "MD", "IPYNB" — from the file name, else the material group. */
export function typeLabelOf(material) {
  const extension = /\.([a-z0-9]+)$/i.exec(fileNameOf(material))?.[1];
  return extension ? extension.toUpperCase() : (groupOf(material.type)?.short ?? "File");
}

/* null when the material can be added; otherwise a sentence saying why not. */
export function materialContextProblem(material) {
  const name = `“${fileNameOf(material)}”`;
  if (!SUPPORTED_TYPES.has(material.type)) {
    return `${name} can’t be added: the study assistant reads PDFs, slides, notes and notebooks only.`;
  }
  if (material.status === "processing" || material.status === "uploading") {
    return `${name} is still being processed, so the study assistant can’t read it yet.`;
  }
  if (material.status === "failed") {
    return `${name} couldn’t be processed, so the study assistant can’t read it. Retry processing first.`;
  }
  if (material.status && material.status !== "completed") {
    return `${name} isn’t searchable, so the study assistant can’t read it.`;
  }
  return null;
}

export function toMaterialContext(material) {
  return {
    id: `material:${material.id}`,
    lectureId: material.id,
    fileName: fileNameOf(material),
    typeLabel: typeLabelOf(material),
  };
}
