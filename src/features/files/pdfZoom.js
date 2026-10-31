export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

const PDF_PAGE_WIDTH_AT_100 = 816;
const PDF_FIT_PADDING = 8;

export function getFitZoomIndex(panelWidth) {
  const availableWidth = Math.max(0, panelWidth - PDF_FIT_PADDING);
  const fitIndex = ZOOM_STEPS.findLastIndex(
    (zoom) => zoom <= 100 && (PDF_PAGE_WIDTH_AT_100 * zoom) / 100 <= availableWidth,
  );
  return Math.max(0, fitIndex);
}
