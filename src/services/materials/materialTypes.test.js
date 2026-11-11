import { describe, expect, it } from "vitest";

import { ACCEPTED_EXTENSIONS, formatFileSize, materialTypeOf, SUPPORTED_LABEL } from "./materialTypes.js";

describe("material types", () => {
  it.each([
    ["Lecture 1.PDF", "pdf"],
    ["week2.pptx", "slides"],
    ["legacy.PPT", "slides"],
    ["lab.ipynb", "notebook"],
    ["summary.md", "notes"],
    ["essay.docx", null],
    ["README", null],
  ])("%s → %s", (name, type) => {
    expect(materialTypeOf(name)).toBe(type);
  });

  it("describes the accepted files", () => {
    expect(ACCEPTED_EXTENSIONS).toBe(".md,.pptx,.ppt,.pdf,.ipynb");
    expect(SUPPORTED_LABEL).toBe("MD, PPTX, PPT, PDF and IPYNB");
  });

  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25 MB");
  });
});
