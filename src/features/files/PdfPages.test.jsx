import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  The pdf.js viewer (jsdom can't draw PDFs, so pdf.js is replaced by a small fake that
  records what is drawn). The browser-frame fallback is covered in PdfViewerPanel.test.js.
*/

const fake = vi.hoisted(() => ({ rendered: [], textLayers: 0, destroyed: 0, fail: false }));

vi.mock("./pdfDocument.js", () => {
  const page = (number) => ({
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale, scale, rotation: 0, rawDims: { pageWidth: 600, pageHeight: 800 } }),
    render: ({ viewport }) => {
      fake.rendered.push({ number, scale: viewport.scale });
      return { promise: Promise.resolve(), cancel() {} };
    },
    streamTextContent: () => ({}),
  });
  class TextLayer {
    constructor() {
      fake.textLayers += 1;
    }
    render() {
      return Promise.resolve();
    }
    cancel() {}
  }
  const lib = {
    TextLayer,
    getDocument: () => ({
      promise: fake.fail ? Promise.reject(new Error("Invalid PDF")) : Promise.resolve({ numPages: 4, getPage: async (n) => page(n) }),
      destroy() {
        fake.destroyed += 1;
      },
    }),
  };
  return { canRenderPdf: () => true, loadPdfjs: () => Promise.resolve(lib), CSS_PX_PER_POINT: 96 / 72 };
});

const { default: PdfViewerPanel } = await import("./PdfViewerPanel.jsx");

const material = { name: "Decision Trees", url: "blob:test/1", meta: "PDF · 4 pages", pages: 4 };

beforeEach(() => {
  fake.rendered = [];
  fake.textLayers = 0;
  fake.destroyed = 0;
  fake.fail = false;
  // jsdom has no canvas drawing; the fake pdf.js only needs a context object.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({});
});
afterEach(() => vi.restoreAllMocks());

describe("PDF viewer drawn with pdf.js", () => {
  it("draws every page with selectable text, and page previews in the sidebar", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PdfViewerPanel material={material} onCollapse={() => {}} />);

    const pages = await screen.findByLabelText("PDF pages");
    expect(within(pages).getAllByLabelText(/^Page \d$/)).toHaveLength(4);
    expect(document.querySelector("iframe")).toBeNull();
    await waitFor(() => expect(fake.textLayers).toBe(4)); // no IntersectionObserver in jsdom: all pages count as visible
    expect(new Set(fake.rendered.map((item) => item.number))).toEqual(new Set([1, 2, 3, 4]));

    await user.click(screen.getByRole("button", { name: "Show pages" }));
    const thumbs = screen.getByRole("navigation", { name: "Pages" });
    expect(within(thumbs).getAllByRole("button")).toHaveLength(4);
    expect(thumbs.querySelectorAll("canvas")).toHaveLength(4); // real previews, not numbered tiles

    await user.click(within(thumbs).getByRole("button", { name: "Page 3" }));
    expect(screen.getByLabelText("Page number")).toHaveValue("3");
    expect(within(thumbs).getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");

    unmount();
    expect(fake.destroyed).toBe(1); // the document is closed with the viewer
  });

  it("zooms in steps of the page's real size and goes back to Fit", async () => {
    const user = userEvent.setup();
    render(<PdfViewerPanel material={material} onCollapse={() => {}} />);
    await screen.findByLabelText("PDF pages");
    expect(screen.getByText("Fit")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const zoomed = screen.getByText(/^\d+%$/).textContent;
    // 100 % = 96 px per inch: a 600-point-wide page is drawn at zoom/100 × 4/3.
    const scale = (parseInt(zoomed, 10) / 100) * (96 / 72);
    await waitFor(() => expect(fake.rendered.some((item) => Math.abs(item.scale - scale) < 1e-9)).toBe(true));
    expect(screen.getAllByLabelText(/^Page \d$/)[0].style.width).toBe(`${Math.floor(600 * scale)}px`);

    await user.click(screen.getByRole("button", { name: "Fit" }));
    expect(screen.getByText("Fit", { selector: ".viewer__zoom-value" })).toBeInTheDocument();
  });

  it("marks the cited page", async () => {
    render(<PdfViewerPanel material={material} initialPage={2} cited onCollapse={() => {}} />);
    await screen.findByLabelText("PDF pages");
    expect(screen.getByText("Opened from a source in the answer: page 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Page 2")).toHaveClass("pdf-page--cited");
  });

  it("falls back to the browser's own viewer when pdf.js can't open the file", async () => {
    fake.fail = true;
    render(<PdfViewerPanel material={material} onCollapse={() => {}} />);
    await waitFor(() => expect(document.querySelector("iframe.pdf__frame")).not.toBeNull());
    expect(document.querySelector("iframe.pdf__frame").getAttribute("src")).toContain("blob:test/1#page=1");
  });
});
