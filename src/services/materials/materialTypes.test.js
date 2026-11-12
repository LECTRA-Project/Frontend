import { describe, expect, it } from "vitest";

import { ACCEPTED_EXTENSIONS, formatFileSize, materialTypeOf, SUPPORTED_LABEL } from "./materialTypes.js";

describe("material types", () => {
  it.each([
    ["Lecture 1.PDF", "pdf"],
    ["week2.pptx", "slides"],
    ["lab.ipynb", "notebook"],
    ["board.JPG", "image"],
    ["diagram.webp", "image"],
    // Not accepted by the backend (422).
    ["legacy.ppt", null],
    ["summary.md", null],
    ["essay.docx", null],
    ["README", null],
  ])("%s → %s", (name, type) => {
    expect(materialTypeOf(name)).toBe(type);
  });

  it("accepts exactly the files the backend accepts", () => {
    expect(ACCEPTED_EXTENSIONS).toBe(".pdf,.pptx,.ipynb,.png,.jpg,.jpeg,.gif,.webp");
    expect(SUPPORTED_LABEL).toBe("PDF, PPTX, IPYNB and images (PNG, JPG, JPEG, GIF, WEBP)");
  });

  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25 MB");
  });
});
