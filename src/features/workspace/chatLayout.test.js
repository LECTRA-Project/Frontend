import { describe, expect, it } from "vitest";

import {
  CHAT_MIN,
  computeLayout,
  groupChats,
  NOTEBOOK_DEFAULT,
  NOTEBOOK_MIN,
  RAIL_WIDTH,
  resizeStep,
  SIDEBAR_WIDTH,
  sidebarFits,
  sourceChip,
  sourceChips,
  VIEWER_DEFAULT,
  VIEWER_MIN,
  viewerAutoWidth,
} from "./chatLayout.js";

const AUTO = viewerAutoWidth(1440 - 272); // 642: 55% of the room beside the menu

const at1440 = (viewer = {}, notebook = {}, sidebar = SIDEBAR_WIDTH) => computeLayout({ width: 1440, sidebar, viewer, notebook });

describe("panel widths", () => {
  it("gives the whole row to the chat when nothing is open", () => {
    expect(at1440()).toMatchObject({ viewerWidth: 0, pinned: false, chatWidth: 1440 - SIDEBAR_WIDTH });
  });

  it("clamps the viewer between its minimum and what leaves the chat 380 px", () => {
    expect(at1440({ open: true }).viewerWidth).toBe(AUTO);
    expect(AUTO).toBe(642);
    // Never narrower than VIEWER_DEFAULT on smaller screens, and wider on big ones.
    expect(viewerAutoWidth(800)).toBe(VIEWER_DEFAULT);
    expect(computeLayout({ width: 1920, sidebar: SIDEBAR_WIDTH, viewer: { open: true } }).viewerWidth).toBe(Math.round((1920 - 272) * 0.55));
    expect(at1440({ open: true, width: 5000 })).toMatchObject({ viewerWidth: 1440 - 272 - CHAT_MIN, chatWidth: CHAT_MIN });
    expect(at1440({ open: true, width: 10 }).viewerWidth).toBe(VIEWER_MIN);
    // Collapsing the menu to the rail gives the viewer more room.
    expect(at1440({ open: true, width: 5000 }, {}, RAIL_WIDTH).viewerWidth).toBe(1440 - 64 - CHAT_MIN);
  });

  it("gives the viewer its room first when it is switched next to the chat", () => {
    const switched = computeLayout({ width: 1440, sidebar: RAIL_WIDTH, viewer: { open: true }, notebook: { open: true, pinned: true }, viewerFirst: true });
    expect(switched).toMatchObject({ pinned: true, viewerWidth: 1440 - 64 - CHAT_MIN - NOTEBOOK_MIN, notebookWidth: NOTEBOOK_MIN, chatWidth: CHAT_MIN });
    // Without viewerFirst, a pinned notebook takes its default room first and the viewer gets less.
    expect(computeLayout({ width: 1440, sidebar: RAIL_WIDTH, viewer: { open: true }, notebook: { open: true, pinned: true } }).viewerWidth).toBe(1440 - 64 - CHAT_MIN - NOTEBOOK_DEFAULT);
    // On a wide screen the viewer gets its automatic width and the notebook its default.
    const wide = computeLayout({ width: 2400, sidebar: RAIL_WIDTH, viewer: { open: true }, notebook: { open: true, pinned: true }, viewerFirst: true });
    expect(wide.viewerWidth).toBe(Math.round((2400 - 64) * 0.55));
    expect(wide.notebookWidth).toBe(NOTEBOOK_DEFAULT);
  });

  it("widens the viewer to its maximum and restores the automatic width", () => {
    const auto = at1440({ open: true });
    expect(auto).toMatchObject({ viewerWide: false, viewerCanWiden: true });
    const widest = at1440({ open: true, width: auto.viewerMax });
    expect(widest).toMatchObject({ viewerWidth: 1440 - 272 - CHAT_MIN, viewerWide: true, viewerCanWiden: true });
    // Closed: nothing to toggle. On a narrow row where the viewer can only be its minimum, neither.
    expect(at1440()).toMatchObject({ viewerWide: false, viewerCanWiden: false });
    expect(computeLayout({ width: 1000, sidebar: SIDEBAR_WIDTH, viewer: { open: true } })).toMatchObject({ viewerWidth: VIEWER_MIN, viewerCanWiden: false });
  });

  it("lets a floating notebook cover most of the chat but never the viewer", () => {
    const floating = at1440({ open: true }, { open: true, width: 5000 });
    expect(floating.pinned).toBe(false);
    expect(floating.notebookWidth).toBe(1440 - 272 - AUTO - 48);
    expect(floating.chatWidth).toBe(1440 - 272 - AUTO); // floating does not take room from the chat
    expect(floating.wide).toBe(true);
    expect(at1440({}, { open: true, width: 10 }).notebookWidth).toBe(NOTEBOOK_MIN);
  });

  it("pins the notebook between chat and viewer, leaving the chat 380 px; the viewer gives way first", () => {
    const pinned = at1440({ open: true }, { open: true, pinned: true, width: NOTEBOOK_DEFAULT });
    expect(pinned).toMatchObject({ pinned: true, canPin: true, viewerWidth: VIEWER_MIN });
    expect(pinned.notebookWidth).toBe(1440 - 272 - VIEWER_MIN - CHAT_MIN);
    expect(pinned.chatWidth).toBe(CHAT_MIN);

    const alone = at1440({}, { open: true, pinned: true, width: 5000 });
    expect(alone.notebookWidth).toBe(1440 - 272 - CHAT_MIN);
    expect(alone.chatWidth).toBe(CHAT_MIN);
  });

  it("widens the notebook to its widest and restores it to the default, or to the minimum when the default does not fit", () => {
    const roomy = at1440({}, { open: true, pinned: true, width: NOTEBOOK_DEFAULT });
    expect(roomy).toMatchObject({ wide: false, canWiden: true, toggledWidth: 1440 - 272 - CHAT_MIN });
    expect(at1440({}, { open: true, pinned: true, width: 5000 })).toMatchObject({ wide: true, toggledWidth: NOTEBOOK_DEFAULT });
    // Pinned beside the viewer the widest is 428 px, below the default: restoring goes to the minimum.
    const tight = at1440({ open: true }, { open: true, pinned: true, width: NOTEBOOK_DEFAULT });
    expect(tight).toMatchObject({ notebookWidth: 428, wide: true, canWiden: true, toggledWidth: NOTEBOOK_MIN });
    // Restored to the minimum, the viewer takes the room back, and Widen still works.
    const restored = at1440({ open: true }, { open: true, pinned: true, width: NOTEBOOK_MIN });
    expect(restored).toMatchObject({ notebookWidth: NOTEBOOK_MIN, viewerWidth: 1440 - 272 - CHAT_MIN - NOTEBOOK_MIN, wide: false, toggledWidth: 428 });
    expect(restored.chatWidth).toBe(CHAT_MIN);
  });

  it("does not pin when there is no room for the notebook beside the chat", () => {
    const narrow = computeLayout({ width: 1100, sidebar: SIDEBAR_WIDTH, viewer: { open: true }, notebook: { open: true, pinned: true } });
    expect(narrow).toMatchObject({ canPin: false, pinned: false });
    expect(narrow.chatWidth).toBeGreaterThanOrEqual(CHAT_MIN);
  });

  it("says when the full menu fits beside the chat and the viewer", () => {
    expect(sidebarFits(1440, true)).toBe(true);
    expect(sidebarFits(1000, false)).toBe(true);
    expect(sidebarFits(1000, true)).toBe(false);
  });

  it("steps 32 px with the arrow keys: left widens, right narrows", () => {
    expect(resizeStep("ArrowLeft")).toBe(32);
    expect(resizeStep("ArrowRight")).toBe(-32);
    expect(resizeStep("Enter")).toBeUndefined();
  });
});

describe("chats list", () => {
  it("groups chats into Today, Yesterday, Previous 7 days and Older by their last activity", () => {
    const now = new Date(2026, 10, 12, 15, 0);
    const iso = (day, hour = 9) => new Date(2026, 10, day, hour).toISOString();
    const groups = groupChats(
      [
        { id: "a", updated_at: iso(12, 1) },
        { id: "b", updated_at: iso(11, 23) },
        { id: "c", updated_at: iso(5) },
        { id: "d", updated_at: iso(1) },
        { id: "e", updated_at: "not a date" },
      ],
      now
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["Previous 7 days", ["c"]],
      ["Older", ["d", "e"]],
    ]);
    expect(groupChats([], now)).toEqual([]);
  });
});

describe("source chips", () => {
  it("labels pages, slides and cells, and falls back to the material type for older answers", () => {
    expect(sourceChip({ lecture_id: "l", lecture_title: "KI 02", page_number: 12, source_type: "page" })).toMatchObject({ loc: "p. 12", doc: "KI 02" });
    expect(sourceChip({ lecture_id: "l", lecture_title: "Deck", page_number: 3, source_type: "slide" }).loc).toBe("Slide 3");
    expect(sourceChip({ lecture_id: "nb", lecture_title: "Reg", page_number: 16 }, () => "notebook")).toMatchObject({ loc: "Cell 16", sourceType: "cell" });
    expect(sourceChip({ lecture_id: "x", lecture_title: "?", page_number: 2 }).loc).toBe("p. 2");
  });

  it("lists each cited place once", () => {
    const source = { lecture_id: "l", lecture_title: "KI 02", page_number: 4, source_type: "page" };
    expect(sourceChips([source, { ...source }, { ...source, page_number: 5 }]).map((chip) => chip.loc)).toEqual(["p. 4", "p. 5"]);
    expect(sourceChips(null)).toEqual([]);
  });
});
