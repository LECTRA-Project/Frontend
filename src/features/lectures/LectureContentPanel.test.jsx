import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLectureFile, getLectureContent } from "../../api/services/lectures.js";
import LectureContentPanel from "./LectureContentPanel.jsx";

/* An uploaded image is shown as the picture only, never with the text read from it. */
vi.mock("../../api/services/lectures.js", () => ({
  fetchLectureFile: vi.fn(),
  getLectureContent: vi.fn(),
}));

const IMAGE = {
  id: "img-1",
  title: "Screenshot",
  original_filename: "Screenshot.png",
  file_type: "image/png",
  processing_status: "completed",
  source_type: "page",
  source_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:image");
  URL.revokeObjectURL = vi.fn();
  fetchLectureFile.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  getLectureContent.mockResolvedValue({
    sections: [{ source_type: "page", source_number: 1, location: "Page 1", text: "Account settings | Text read from the image" }],
  });
});

describe("image viewer", () => {
  it("shows the picture without the text read from it", async () => {
    render(<LectureContentPanel lecture={IMAGE} onClose={() => {}} onRetry={() => {}} />);
    expect(await screen.findByRole("img", { name: "Screenshot" })).toHaveAttribute("src", "blob:image");
    await waitFor(() => expect(fetchLectureFile).toHaveBeenCalled());
    expect(getLectureContent).not.toHaveBeenCalled();
    expect(screen.queryByText(/Text read from the image/)).not.toBeInTheDocument();
    expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading content…")).not.toBeInTheDocument();
  });
});
