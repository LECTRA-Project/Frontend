/*
  Chat-first workspace: panel widths, chat groups and source labels.

  The row under the header holds, from left to right:
    menu (272 px, or a 64 px rail) | chat (always centred, max 760 px) | [notebook] | [viewer]
  - The material viewer is docked at the right edge. Its width is the student's choice,
    clamped so the chat keeps at least CHAT_MIN.
  - The notebook floats by default (left of the viewer). Pinned, it sits between the chat
    and the viewer, leaving CHAT_MIN. Pinning is only offered when there is room for that.
  - Whenever there is that room, a floating notebook doesn't cover the chat either: it gets
    the same widths as pinned and the chat reserves its width (`chatInset`), so the chat's
    messages and composer reflow beside it — also while it is being resized. Only when the
    row is too narrow for both does the floating notebook lie over the chat.
  All widths are in CSS pixels; `width` is the width of the whole row.
*/
import { t } from "../../i18n/i18n.js";

export const SIDEBAR_WIDTH = 272;
export const RAIL_WIDTH = 64;
export const CHAT_MIN = 380;
export const NOTEBOOK_MIN = 340;
export const NOTEBOOK_DEFAULT = 480;
export const VIEWER_MIN = 360;
export const VIEWER_DEFAULT = 560;
// Until the student resizes it, the viewer takes this share of the room beside the menu
// (never less than VIEWER_DEFAULT), so lecture pages are readable on wide screens too.
export const VIEWER_SHARE = 0.55;

/* The viewer's width before the student resizes it, for `room` px beside the menu. */
export function viewerAutoWidth(room) {
  return Math.max(VIEWER_DEFAULT, Math.round(room * VIEWER_SHARE));
}
export const RESIZE_STEP = 32;
// A floating notebook leaves this much of the chat visible at its left.
const FLOAT_GAP = 48;
// Below this window width the menu is an overlay and the panels open full-screen.
export const PHONE_QUERY = "(max-width: 760px)";

const clamp = (value, min, max) => Math.round(Math.min(max, Math.max(min, value)));

/*
  Widths for the current state. Returns:
    viewerWidth, viewerMax         0 when the viewer is closed
    notebookWidth, notebookMax     the notebook's width (floating or pinned) and its limit
    pinned                         the notebook is pinned (asked for, and there is room)
    canPin                         there is room to pin it beside the chat
    wide                           the notebook is at its widest
    viewerWide, viewerCanWiden     the viewer's Widen / Restore toggle: whether it is at its
                                   widest, and whether widening can change anything (Widen
                                   sets viewerMax; Restore goes back to the automatic width)
    canWiden, toggledWidth         the Widen / Restore toggle: whether it can change anything,
                                   and the width it sets
    chatWidth                      what is left for the chat column
    chatInset                      room the chat leaves at its right for a floating notebook
    beside                         the notebook sits beside the chat (pinned, or floating with room)
*/
export function computeLayout({ width, sidebar, viewer = {}, notebook = {}, viewerFirst = false }) {
  const viewerOpen = Boolean(viewer.open);
  const notebookOpen = Boolean(notebook.open);
  const room = width - sidebar;
  const canPin = notebookOpen && room - (viewerOpen ? VIEWER_MIN : 0) - NOTEBOOK_MIN >= CHAT_MIN;
  const pinned = Boolean(notebook.pinned) && canPin;
  // Beside the chat (pinned, or floating with room for both): the chat is never covered.
  const beside = notebookOpen && canPin;
  let viewerMax;
  let viewerWidth;
  let viewerAuto = 0; // the automatic width, for the Widen / Restore toggle
  let notebookMax;
  let notebookWidth;
  if (pinned && viewerFirst && viewerOpen) {
    // Notebook and viewer switched (the viewer next to the chat): the viewer keeps a readable
    // width first; the notebook gets what is left, down to its minimum; the chat keeps CHAT_MIN.
    viewerMax = Math.max(VIEWER_MIN, room - CHAT_MIN - NOTEBOOK_MIN);
    viewerAuto = clamp(viewerAutoWidth(room), VIEWER_MIN, viewerMax);
    viewerWidth = clamp(viewer.width ?? viewerAuto, VIEWER_MIN, viewerMax);
    notebookMax = Math.max(NOTEBOOK_MIN, room - CHAT_MIN - viewerWidth);
    notebookWidth = clamp(notebook.width ?? NOTEBOOK_DEFAULT, NOTEBOOK_MIN, notebookMax);
  } else if (beside) {
    // A notebook beside the chat takes its room first (the viewer at its minimum, the chat at
    // CHAT_MIN); the viewer gets what the notebook leaves.
    notebookMax = Math.max(NOTEBOOK_MIN, room - (viewerOpen ? VIEWER_MIN : 0) - CHAT_MIN);
    notebookWidth = clamp(notebook.width ?? NOTEBOOK_DEFAULT, NOTEBOOK_MIN, notebookMax);
    viewerMax = viewerOpen ? Math.max(VIEWER_MIN, room - CHAT_MIN - notebookWidth) : 0;
    viewerAuto = viewerOpen ? clamp(viewerAutoWidth(room - notebookWidth), VIEWER_MIN, viewerMax) : 0;
    viewerWidth = viewerOpen ? clamp(viewer.width ?? viewerAuto, VIEWER_MIN, viewerMax) : 0;
  } else {
    // No room for both: floating, it never covers the viewer and leaves a strip of the chat visible.
    viewerMax = viewerOpen ? Math.max(VIEWER_MIN, room - CHAT_MIN) : 0;
    viewerAuto = viewerOpen ? clamp(viewerAutoWidth(room), VIEWER_MIN, viewerMax) : 0;
    viewerWidth = viewerOpen ? clamp(viewer.width ?? viewerAuto, VIEWER_MIN, viewerMax) : 0;
    notebookMax = Math.max(NOTEBOOK_MIN, room - viewerWidth - FLOAT_GAP);
    notebookWidth = clamp(notebook.width ?? NOTEBOOK_DEFAULT, NOTEBOOK_MIN, notebookMax);
  }
  const wide = notebookWidth >= notebookMax - 4;
  return {
    viewerWidth,
    viewerMax,
    viewerWide: viewerOpen && viewerWidth >= viewerMax - 4,
    // Something to toggle: it can grow, or restoring would make it narrower.
    viewerCanWiden: viewerOpen && (viewerWidth < viewerMax - 4 || viewerAuto < viewerMax - 4),
    notebookWidth,
    notebookMax,
    pinned,
    canPin,
    wide,
    // Widen / restore: to the widest, or back to the default (the minimum when even the
    // default does not fit). Nothing to toggle when the widest is the minimum.
    canWiden: notebookMax - 4 > NOTEBOOK_MIN,
    toggledWidth: wide ? (NOTEBOOK_DEFAULT < notebookMax - 4 ? NOTEBOOK_DEFAULT : NOTEBOOK_MIN) : notebookMax,
    chatWidth: room - viewerWidth - (beside ? notebookWidth : 0),
    chatInset: beside && !pinned ? notebookWidth : 0,
    beside,
  };
}

/*
  The divider between the notebook and the viewer when both sit beside the chat: it moves
  width from one to the other and their total stays the same, so the chat is untouched.
  `right` is the width asked for the panel at the right edge; each keeps its minimum.
  Returns { right, left }, or null when the two can't be split (no room for both minimums).
*/
export function splitPanels({ total, right, rightMin, leftMin }) {
  if (total - leftMin < rightMin) return null;
  const width = Math.round(Math.min(total - leftMin, Math.max(rightMin, right)));
  return { right: width, left: total - width };
}

/* Whether the full menu fits beside the chat (and the viewer, when it is open). */
export function sidebarFits(width, viewerOpen) {
  return width - SIDEBAR_WIDTH - (viewerOpen ? VIEWER_MIN : 0) >= CHAT_MIN;
}

/* Arrow keys on a resize handle: left widens the panel (it grows leftwards), right narrows it. */
export function resizeStep(key) {
  return { ArrowLeft: RESIZE_STEP, ArrowRight: -RESIZE_STEP }[key];
}

/* ---------- Chats list ---------- */

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"];

/* The heading shown for a group (GROUPS holds the English names). */
function groupLabel(group) {
  if (group === "Today") return t("Today");
  if (group === "Yesterday") return t("Yesterday");
  if (group === "Previous 7 days") return t("Previous 7 days");
  return t("Older");
}

/* Sessions grouped by their last activity (updated_at): [{ label, items }], empty groups left out. */
export function groupChats(sessions, now = new Date()) {
  const startOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = startOf(now);
  const groups = new Map(GROUPS.map((label) => [label, []]));
  for (const session of sessions) {
    const date = new Date(session.updated_at);
    const days = Number.isNaN(date.getTime()) ? Infinity : Math.round((today - startOf(date)) / 86400000);
    const label = days <= 0 ? "Today" : days === 1 ? "Yesterday" : days <= 7 ? "Previous 7 days" : "Older";
    groups.get(label).push(session);
  }
  return GROUPS.map((group) => ({ label: groupLabel(group), items: groups.get(group) })).filter((group) => group.items.length > 0);
}

/* ---------- Sources under an answer ---------- */

// Where a cited page_number points, by material type (for answers saved without source_type).
const SOURCE_TYPE_BY_MATERIAL = { pdf: "page", slides: "slide", notebook: "cell", notes: "section" };
/* The chip's short location, e.g. "p. 12" | "Slide 3" | "Cell 16". */
function shortLocation(sourceType, number) {
  if (sourceType === "slide") return t("Slide {number}", { number });
  if (sourceType === "cell") return t("Cell {number}", { number });
  if (sourceType === "section") return t("Section {number}", { number });
  return t("p. {number}", { number });
}

/*
  A source chip: { key, lectureId, sourceType, number, loc: "p. 12" | "Slide 3" | "Cell 16", doc }.
  `materialType(lectureId)` gives the material type when the source has no source_type;
  `titleOf(lectureId)` the lecture's current title (it may have been renamed since).
*/
export function sourceChip(source, materialType = () => undefined, titleOf = () => undefined) {
  const sourceType = source.source_type ?? SOURCE_TYPE_BY_MATERIAL[materialType(source.lecture_id)] ?? "page";
  return {
    key: `${source.lecture_id}-${sourceType}-${source.page_number}`,
    lectureId: source.lecture_id,
    sourceType,
    number: source.page_number,
    loc: shortLocation(sourceType, source.page_number),
    doc: titleOf(source.lecture_id) ?? source.lecture_title,
  };
}

/* Unique chips for an answer's sources, in the order given. */
export function sourceChips(sources, materialType, titleOf) {
  const seen = new Set();
  const chips = [];
  for (const source of sources ?? []) {
    const chip = sourceChip(source, materialType, titleOf);
    if (seen.has(chip.key)) continue;
    seen.add(chip.key);
    chips.push(chip);
  }
  return chips;
}
