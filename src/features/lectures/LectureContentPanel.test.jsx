import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLectureFile, getLectureContent } from "../../api/services/lectures.js";
import LectureContentPanel from "./LectureContentPanel.jsx";
import { installFakeIntersectionObserver } from "../../test/intersectionObserver.js";

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

/* Reading progress: which slides / cells are on screen, and the "Read 2 of 3" label. */
describe("reading progress in the content viewer", () => {
  const DECK = {
    id: "deck-1",
    title: "Game playing",
    original_filename: "game.pptx",
    file_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    processing_status: "completed",
    source_type: "slide",
    source_count: 3,
  };
  const slide = (number, extra = {}) => ({ source_type: "slide", source_number: number, location: `Slide ${number}`, text: `Slide ${number} text`, ...extra });
  let io;

  beforeEach(() => {
    io = installFakeIntersectionObserver();
    getLectureContent.mockResolvedValue({
      // Slide 2 has notes: two sections, one block, one page.
      sections: [slide(1), slide(2), slide(2, { source_label: "notes", text: "Speaker notes" }), slide(3)],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports the slides at least half on screen by their source number", async () => {
    const onVisiblePages = vi.fn();
    const { unmount } = render(
      <LectureContentPanel lecture={DECK} onClose={() => {}} onRetry={() => {}} reading={{ progress: null, onVisiblePages }} />
    );
    await screen.findByText("Slide 3 text");

    io.show({ 1: 1, 2: 0.6, 3: 0.2 });
    expect(onVisiblePages).toHaveBeenLastCalledWith([1, 2]);
    io.show({ 1: 0.4, 3: 0.5 });
    expect(onVisiblePages).toHaveBeenLastCalledWith([2, 3]);
    // A slide taller than the viewer counts while it fills at least half of it.
    io.show({ 2: 0, 3: 0, 1: { ratio: 0.3, height: 450 } }, { rootHeight: 800 });
    expect(onVisiblePages).toHaveBeenLastCalledWith([1]);

    unmount();
    expect(onVisiblePages).toHaveBeenLastCalledWith([]);
  });

  it("shows how many slides were read in the header", async () => {
    render(
      <LectureContentPanel
        lecture={DECK}
        onClose={() => {}}
        onRetry={() => {}}
        reading={{ progress: { viewed: 2, total: 3, unit: "slide" }, onVisiblePages: vi.fn() }}
      />
    );
    const label = await screen.findByTestId("reading-progress");
    expect(label).toHaveTextContent("Read 2 of 3");
    expect(label).toHaveAttribute("title", "You have read 2 of 3 slides");
  });

  it("reports page 1 of an image once the picture is shown", async () => {
    const onVisiblePages = vi.fn();
    render(<LectureContentPanel lecture={IMAGE} onClose={() => {}} onRetry={() => {}} reading={{ progress: null, onVisiblePages }} />);
    await screen.findByRole("img", { name: "Screenshot" });
    await waitFor(() => expect(onVisiblePages).toHaveBeenLastCalledWith([1]));
  });

  it("neither tracks nor labels slides shown in the Office viewer", async () => {
    const onVisiblePages = vi.fn();
    render(
      <LectureContentPanel
        lecture={{ ...DECK, s3_url: "https://bucket.s3.amazonaws.com/game.pptx" }}
        onClose={() => {}}
        onRetry={() => {}}
        reading={{ progress: { viewed: 1, total: 3, unit: "slide" }, onVisiblePages }}
      />
    );
    const view = screen.getByRole("region", { name: "Lecture: Game playing" });
    expect(within(view).getByTitle("Slides: Game playing")).toBeInTheDocument();
    expect(screen.queryByTestId("reading-progress")).not.toBeInTheDocument();
    expect(onVisiblePages).not.toHaveBeenCalled();
  });

  it("does nothing without the reading prop (basic mode)", async () => {
    render(<LectureContentPanel lecture={DECK} onClose={() => {}} onRetry={() => {}} />);
    await screen.findByText("Slide 3 text");
    expect(io.observers.size).toBe(0);
    expect(screen.queryByTestId("reading-progress")).not.toBeInTheDocument();
  });
});
