import { t } from "../../i18n/i18n.js";

/*
  The banner text for a viewer opened from a cited source. `citedIn` is where the source
  was ("the answer" or "the exam results"); `place` names the spot, e.g. sourcePlace("page", 12).
*/
export function citedBannerText(citedIn, place) {
  return /exam/i.test(citedIn ?? "")
    ? t("Opened from a source in the exam results: {place}", { place })
    : t("Opened from a source in the answer: {place}", { place });
}

/* "page 12", "slide 3", "cell 4", "section 2" (lowercase, as used inside a sentence). */
export function sourcePlace(type, number) {
  if (type === "page") return t("page {number}", { number });
  if (type === "slide") return t("slide {number}", { number });
  if (type === "cell") return t("cell {number}", { number });
  return t("section {number}", { number });
}

/* The accessible name of a page tile or thumbnail: "Page 3" or "Page 3 (cited in the answer)". */
export function pageTileLabel(number, cited, citedIn) {
  if (!cited) return t("Page {number}", { number });
  return /exam/i.test(citedIn ?? "")
    ? t("Page {number} (cited in the exam results)", { number })
    : t("Page {number} (cited in the answer)", { number });
}
