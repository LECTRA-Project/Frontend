import { createElement } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PdfViewerPanel from "./PdfViewerPanel.jsx";

import { getFitZoomIndex } from "./pdfZoom.js";

describe("PDF viewer fit zoom", () => {
  it.each([
    [500, 0],
    [620, 1],
    [900, 2],
    [1600, 2],
  ])("fits a %s-pixel panel at zoom step %s", (panelWidth, expectedIndex) => {
    expect(getFitZoomIndex(panelWidth)).toBe(expectedIndex);
  });
});

describe("PDF viewer page navigation", () => {
  const material = { name: "Decision Trees", url: "blob:test/1", meta: "PDF · 5 pages", pages: 5 };
  const frameSrc = () => document.querySelector("iframe.pdf__frame").getAttribute("src");

  it("jumps to any page from the pages sidebar, highlighting the current and cited page", async () => {
    const user = userEvent.setup();
    render(createElement(PdfViewerPanel, { material, initialPage: 2, cited: true, onCollapse: () => {} }));

    // jsdom has no layout (width 0), so the sidebar starts closed; the Pages button opens it.
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show pages" }));
    const pages = screen.getByRole("navigation", { name: "Pages" });
    expect(within(pages).getAllByRole("button")).toHaveLength(5);
    expect(within(pages).getByRole("button", { name: "Page 2 (cited in the answer)" })).toHaveAttribute("aria-current", "page");

    await user.click(within(pages).getByRole("button", { name: "Page 4" }));
    expect(screen.getByLabelText("Page number")).toHaveValue("4");
    expect(frameSrc()).toContain("#page=4&");
    expect(within(pages).getByRole("button", { name: "Page 4" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Hide pages" }));
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("goes to the first and last page", async () => {
    const user = userEvent.setup();
    render(createElement(PdfViewerPanel, { material, initialPage: 3, onCollapse: () => {} }));
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(screen.getByLabelText("Page number")).toHaveValue("5");
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "First page" }));
    expect(screen.getByLabelText("Page number")).toHaveValue("1");
    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
  });

  it("lets the page box be cleared and retyped, and applies it on Enter", async () => {
    const user = userEvent.setup();
    render(createElement(PdfViewerPanel, { material, initialPage: 1, onCollapse: () => {} }));
    const input = screen.getByLabelText("Page number");
    await user.click(input);
    await user.keyboard("{End}{Backspace}");
    expect(input).toHaveValue("");
    await user.keyboard("4");
    expect(input).toHaveValue("4");
    expect(frameSrc()).toContain("#page=1&"); // not applied while typing
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("4");
    expect(frameSrc()).toContain("#page=4&");
  });

  it("applies the page box on blur, limited to the last page", async () => {
    const user = userEvent.setup();
    render(createElement(PdfViewerPanel, { material, initialPage: 2, onCollapse: () => {} }));
    const input = screen.getByLabelText("Page number");
    await user.clear(input);
    await user.type(input, "14");
    await user.tab();
    expect(input).toHaveValue("5");
    expect(frameSrc()).toContain("#page=5&");
  });

  it.each(["0", "abc", "", "-2", "2.5"])("puts the current page back for %j", async (typed) => {
    const user = userEvent.setup();
    render(createElement(PdfViewerPanel, { material, initialPage: 3, onCollapse: () => {} }));
    const input = screen.getByLabelText("Page number");
    await user.clear(input);
    if (typed) await user.type(input, typed);
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("3");
    expect(frameSrc()).toContain("#page=3&");
  });

  it("has no pages sidebar when the page count is unknown", () => {
    render(createElement(PdfViewerPanel, { material: { ...material, pages: undefined }, onCollapse: () => {} }));
    expect(screen.queryByRole("button", { name: "Show pages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last page" })).not.toBeInTheDocument();
  });
});

describe("PDF viewer reading progress (the browser's frame)", () => {
  const material = { name: "Decision Trees", url: "blob:test/1", meta: "PDF · 5 pages", pages: 5 };

  it("reports the page on screen as the student pages through, and nothing once closed", async () => {
    const user = userEvent.setup();
    const onVisiblePages = vi.fn();
    const { unmount } = render(
      createElement(PdfViewerPanel, { material, initialPage: 2, onCollapse: () => {}, reading: { progress: null, onVisiblePages } })
    );
    expect(onVisiblePages).toHaveBeenLastCalledWith([2]);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onVisiblePages).toHaveBeenLastCalledWith([3]);
    await user.click(screen.getByRole("button", { name: "Last page" }));
    expect(onVisiblePages).toHaveBeenLastCalledWith([5]);
    unmount();
    expect(onVisiblePages).toHaveBeenLastCalledWith([]);
  });

  it("reports nothing while the file is still loading", () => {
    const onVisiblePages = vi.fn();
    render(
      createElement(PdfViewerPanel, {
        material: { ...material, url: null, loading: true },
        onCollapse: () => {},
        reading: { progress: null, onVisiblePages },
      })
    );
    expect(onVisiblePages).not.toHaveBeenCalledWith([1]);
  });

  it("shows the pages read in the header, and no label without the reading prop", () => {
    const { unmount } = render(
      createElement(PdfViewerPanel, { material, onCollapse: () => {}, reading: { progress: { viewed: 12, total: 65, unit: "page" }, onVisiblePages: vi.fn() } })
    );
    const label = screen.getByTestId("reading-progress");
    expect(label).toHaveTextContent("Read 12 of 65");
    expect(label.querySelector(".viewer__progress-short")).toHaveTextContent("12/65");
    expect(label).toHaveAttribute("title", "You have read 12 of 65 pages");
    unmount();

    render(createElement(PdfViewerPanel, { material, onCollapse: () => {} }));
    expect(screen.queryByTestId("reading-progress")).not.toBeInTheDocument();
  });
});
