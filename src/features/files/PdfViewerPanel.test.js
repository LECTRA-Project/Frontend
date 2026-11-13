import { createElement } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

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

  it("has no pages sidebar when the page count is unknown", () => {
    render(createElement(PdfViewerPanel, { material: { ...material, pages: undefined }, onCollapse: () => {} }));
    expect(screen.queryByRole("button", { name: "Show pages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last page" })).not.toBeInTheDocument();
  });
});
