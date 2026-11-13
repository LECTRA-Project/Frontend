import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LectureContentPanel from "./LectureContentPanel.jsx";
import { fetchLectureFile, getLectureContent } from "../../api/services/lectures.js";

vi.mock("../../api/services/lectures.js", () => ({
  fetchLectureFile: vi.fn(),
  getLectureContent: vi.fn(),
}));

/*
  Image lectures show the picture itself; the text Lectra read from it (cited as "Page 1")
  is only shown on request.
*/

const imageLecture = (overrides = {}) => ({
  id: "img-1",
  title: "Whiteboard",
  original_filename: "whiteboard.png",
  file_type: "image/png",
  processing_status: "completed",
  processing_error: null,
  source_type: null,
  source_count: 1,
  s3_url: "https://bucket.s3.amazonaws.com/whiteboard.png",
  content_version: "2026-11-13T10:00:00Z",
  ...overrides,
});

const READ_TEXT = { sections: [{ source_number: 1, source_type: "page", source_label: null, location: "Page 1", text: "Course code: KI-4711" }] };

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:test/image", revokeObjectURL: () => {} }));
  fetchLectureFile.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  getLectureContent.mockResolvedValue(READ_TEXT);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("LectureContentPanel: images", () => {
  it("shows the picture, not the read text", async () => {
    render(<LectureContentPanel lecture={imageLecture()} onClose={() => {}} />);
    const image = await screen.findByRole("img", { name: "Whiteboard" });
    expect(image).toHaveAttribute("src", "blob:test/image");
    expect(fetchLectureFile).toHaveBeenCalledWith("img-1", expect.anything());
    await screen.findByRole("button", { name: "Show text" });
    expect(screen.queryByText("Course code: KI-4711")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading content…")).not.toBeInTheDocument();
    // Zoom still works on the picture.
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
  });

  it("toggles between the picture and the read text", async () => {
    const user = userEvent.setup();
    render(<LectureContentPanel lecture={imageLecture()} onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Show text" }));
    expect(screen.getByText("Course code: KI-4711")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Whiteboard" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show image" }));
    expect(screen.getByRole("img", { name: "Whiteboard" })).toBeInTheDocument();
    expect(screen.queryByText("Course code: KI-4711")).not.toBeInTheDocument();
  });

  it("recognises an image by its MIME type even if the backend sends a source type", async () => {
    render(<LectureContentPanel lecture={imageLecture({ source_type: "page" })} onClose={() => {}} />);
    expect(await screen.findByRole("img", { name: "Whiteboard" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Show text" });
    expect(screen.queryByText("Course code: KI-4711")).not.toBeInTheDocument();
  });

  it("opened from a cited source, still shows the picture without a page banner", async () => {
    render(<LectureContentPanel lecture={imageLecture()} focus={{ sourceType: "page", sourceNumber: 1 }} cited onClose={() => {}} />);
    expect(await screen.findByRole("img", { name: "Whiteboard" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Show text" });
    expect(screen.queryByText(/Opened from a source/)).not.toBeInTheDocument();
  });

  it("an image without read text has no text toggle", async () => {
    getLectureContent.mockResolvedValue({ sections: [] });
    render(<LectureContentPanel lecture={imageLecture({ source_count: 0 })} onClose={() => {}} />);
    expect(await screen.findByRole("img", { name: "Whiteboard" })).toBeInTheDocument();
    await waitFor(() => expect(getLectureContent).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Show text" })).not.toBeInTheDocument();
  });

  it("a failed read still shows the picture and offers a retry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <LectureContentPanel
        lecture={imageLecture({ processing_status: "failed", processing_error: "The text could not be read from this file", source_count: 0 })}
        onRetry={onRetry}
        onClose={() => {}}
      />
    );
    expect(await screen.findByRole("img", { name: "Whiteboard" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry processing" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("LectureContentPanel: PDFs keep showing their text", () => {
  it("does not treat a PDF as an image", async () => {
    getLectureContent.mockResolvedValue({ sections: [{ ...READ_TEXT.sections[0], text: "Typed page" }] });
    render(<LectureContentPanel lecture={imageLecture({ file_type: "application/pdf", original_filename: "a.pdf", source_type: "page" })} onClose={() => {}} />);
    expect(await screen.findByText("Typed page")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show text" })).not.toBeInTheDocument();
  });
});
