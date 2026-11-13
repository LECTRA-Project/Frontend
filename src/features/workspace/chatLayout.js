/*
  Chat-first workspace: panel widths, chat groups and source labels.

  The row under the header holds, from left to right:
    menu (272 px, or a 64 px rail) | chat (always centred, max 760 px) | [notebook] | [viewer]
  - The material viewer is docked at the right edge. Its width is the student's choice,
    clamped so the chat keeps at least CHAT_MIN.
  - The notebook floats over the chat by default (left of the viewer) and may cover most
    of it. Pinned, it sits between the chat and the viewer, again leaving CHAT_MIN.
    Pinning is only offered when there is room for that.
  All widths are in CSS pixels; `width` is the width of the whole row.
*/
export const SIDEBAR_WIDTH = 272;
export const RAIL_WIDTH = 64;
export const CHAT_MIN = 380;
export const NOTEBOOK_MIN = 340;
export const NOTEBOOK_DEFAULT = 480;
export const VIEWER_MIN = 360;
export const VIEWER_DEFAULT = 560;
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
    canWiden, toggledWidth         the Widen / Restore toggle: whether it can change anything,
                                   and the width it sets
    chatWidth                      what is left for the chat column
*/
export function computeLayout({ width, sidebar, viewer = {}, notebook = {} }) {
  const viewerOpen = Boolean(viewer.open);
  const notebookOpen = Boolean(notebook.open);
  const room = width - sidebar;
  const canPin = notebookOpen && room - (viewerOpen ? VIEWER_MIN : 0) - NOTEBOOK_MIN >= CHAT_MIN;
  const pinned = Boolean(notebook.pinned) && canPin;
  let viewerMax;
  let viewerWidth;
  let notebookMax;
  let notebookWidth;
  if (pinned) {
    // A pinned notebook takes its room first (the viewer at its minimum, the chat at
    // CHAT_MIN); the viewer gets what the notebook leaves.
    notebookMax = Math.max(NOTEBOOK_MIN, room - (viewerOpen ? VIEWER_MIN : 0) - CHAT_MIN);
    notebookWidth = clamp(notebook.width ?? NOTEBOOK_DEFAULT, NOTEBOOK_MIN, notebookMax);
    viewerMax = viewerOpen ? Math.max(VIEWER_MIN, room - CHAT_MIN - notebookWidth) : 0;
    viewerWidth = viewerOpen ? clamp(viewer.width ?? VIEWER_DEFAULT, VIEWER_MIN, viewerMax) : 0;
  } else {
    // Floating, it never covers the viewer and leaves a strip of the chat visible.
    viewerMax = viewerOpen ? Math.max(VIEWER_MIN, room - CHAT_MIN) : 0;
    viewerWidth = viewerOpen ? clamp(viewer.width ?? VIEWER_DEFAULT, VIEWER_MIN, viewerMax) : 0;
    notebookMax = Math.max(NOTEBOOK_MIN, room - viewerWidth - FLOAT_GAP);
    notebookWidth = clamp(notebook.width ?? NOTEBOOK_DEFAULT, NOTEBOOK_MIN, notebookMax);
  }
  const wide = notebookWidth >= notebookMax - 4;
  return {
    viewerWidth,
    viewerMax,
    notebookWidth,
    notebookMax,
    pinned,
    canPin,
    wide,
    // Widen / restore: to the widest, or back to the default (the minimum when even the
    // default does not fit). Nothing to toggle when the widest is the minimum.
    canWiden: notebookMax - 4 > NOTEBOOK_MIN,
    toggledWidth: wide ? (NOTEBOOK_DEFAULT < notebookMax - 4 ? NOTEBOOK_DEFAULT : NOTEBOOK_MIN) : notebookMax,
    chatWidth: room - viewerWidth - (pinned && notebookOpen ? notebookWidth : 0),
  };
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
  return GROUPS.map((label) => ({ label, items: groups.get(label) })).filter((group) => group.items.length > 0);
}

/* ---------- Sources under an answer ---------- */

// Where a cited page_number points, by material type (for answers saved without source_type).
const SOURCE_TYPE_BY_MATERIAL = { pdf: "page", slides: "slide", notebook: "cell", notes: "section" };
const SHORT = { page: "p.", slide: "Slide", cell: "Cell", section: "Section" };

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
    loc: `${SHORT[sourceType] ?? "p."} ${source.page_number}`,
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
