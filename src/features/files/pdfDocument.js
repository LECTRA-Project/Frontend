/*
  pdf.js, loaded on demand (only when a PDF is opened, so it is not in the main bundle).

  loadPdfjs()     the pdf.js module, with its worker set up (the same promise every time)
  canRenderPdf()  whether this environment can draw PDFs with pdf.js (a real browser with
                  canvas); elsewhere (e.g. jsdom in tests) the viewer uses the browser's
                  own PDF viewer in a frame instead
*/
let pdfjs = null;

export function loadPdfjs() {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
    (error) => {
      pdfjs = null; // let a later PDF try again
      throw error;
    }
  );
  return pdfjs;
}

export function canRenderPdf() {
  return typeof window !== "undefined" && typeof HTMLCanvasElement !== "undefined" && !/jsdom/i.test(navigator.userAgent);
}

// pdf.js measures pages in PDF points (1/72 in); 100 % zoom is the page's real size on
// screen, at 96 CSS px per inch — the same as Chrome's and Firefox's PDF viewers.
export const CSS_PX_PER_POINT = 96 / 72;
