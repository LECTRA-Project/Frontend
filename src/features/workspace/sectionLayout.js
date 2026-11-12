/*
  Arrangement of the four workspace sections.

  A layout is a list of columns, left to right; each column is a stack of section ids,
  top to bottom:
      [["materials"], ["pdf"], ["notebook"], ["assistant"]]      (the default: side by side)

  Every section appears exactly once, there are at most MAX_COLUMNS columns and at most
  MAX_PER_COLUMN sections in a column. A section that is not shown right now (the PDF
  viewer while no PDF is open) keeps its place, and empty columns are simply skipped.

  The workspace never moves a section in the DOM: computeGrid() turns the layout into
  CSS grid tracks and per-section grid coordinates, so moving a section never remounts
  it (the PDF frame, notebook kernel and chat all stay as they are).

  Saved per signed-in user in this browser (localStorage), like the notebook.
*/

export const SECTION_LABELS = {
  materials: "Course materials",
  pdf: "PDF viewer",
  notebook: "Notebook",
  assistant: "Study assistant",
};
export const SECTION_IDS = Object.keys(SECTION_LABELS);
export const DEFAULT_LAYOUT = [["materials"], ["pdf"], ["notebook"], ["assistant"]];
export const MAX_COLUMNS = 4;
export const MAX_PER_COLUMN = 3;

// v2: the default changed to side by side, so arrangements saved for the old default are dropped.
const KEY_PREFIX = "lectra:workspace-layout:v2:";

/* ---------- Validation and storage ---------- */

export function isValidLayout(layout) {
  if (!Array.isArray(layout) || layout.length === 0 || layout.length > MAX_COLUMNS) return false;
  if (!layout.every((column) => Array.isArray(column) && column.length > 0 && column.length <= MAX_PER_COLUMN)) return false;
  const ids = layout.flat();
  return ids.length === SECTION_IDS.length && SECTION_IDS.every((id) => ids.includes(id));
}

export function sameLayout(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* The saved layout, or the default when there is none or it can't be used. */
export function loadLayout(userKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${KEY_PREFIX}${userKey}`));
    return isValidLayout(saved) ? saved : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/* Saves the layout; the default is stored as "nothing saved". Storage errors are ignored. */
export function saveLayout(userKey, layout) {
  try {
    if (sameLayout(layout, DEFAULT_LAYOUT)) localStorage.removeItem(`${KEY_PREFIX}${userKey}`);
    else localStorage.setItem(`${KEY_PREFIX}${userKey}`, JSON.stringify(layout));
  } catch {
    // Blocked or full storage: the arrangement still applies until the page is reloaded.
  }
}

/* ---------- Moving sections ---------- */

function without(layout, id) {
  return layout.map((column) => column.filter((item) => item !== id)).filter((column) => column.length > 0);
}

function locate(layout, id) {
  const column = layout.findIndex((items) => items.includes(id));
  return [column, column < 0 ? -1 : layout[column].indexOf(id)];
}

const accept = (next, layout) => (isValidLayout(next) && !sameLayout(next, layout) ? next : null);

/*
  Drops `id` on an edge of `targetId`:
    left / right   a new column next to the target's column
    top / bottom   above / below the target, in its column
  Returns the new layout, or null when the drop is not possible or changes nothing.
*/
export function placeSection(layout, id, targetId, edge) {
  if (id === targetId) return null;
  const rest = without(layout, id);
  const [column, row] = locate(rest, targetId);
  if (column < 0) return null;
  const next = rest.map((items) => [...items]);
  if (edge === "left" || edge === "right") next.splice(edge === "left" ? column : column + 1, 0, [id]);
  else if (edge === "top" || edge === "bottom") next[column].splice(edge === "top" ? row : row + 1, 0, id);
  else return null;
  return accept(next, layout);
}

/*
  One keyboard step, so that every arrangement can be reached:
    up / down      swap with the nearest shown section above / below in the column
    left / right   if the column has other shown sections: split out into a new column on
                   that side; if it is alone: join the neighbouring column (at the bottom),
                   or jump past it when that column is full.
  `visible` is the set of sections shown right now. Returns the new layout or null.
*/
export function moveSection(layout, id, direction, visible) {
  const [column, row] = locate(layout, id);
  if (column < 0) return null;
  const items = layout[column];
  const shown = (item) => visible.has(item);

  if (direction === "up" || direction === "down") {
    const step = direction === "up" ? -1 : 1;
    let target = row + step;
    while (target >= 0 && target < items.length && !shown(items[target])) target += step;
    if (target < 0 || target >= items.length) return null;
    const next = layout.map((list) => [...list]);
    next[column].splice(row, 1);
    next[column].splice(target, 0, id);
    return accept(next, layout);
  }

  if (direction !== "left" && direction !== "right") return null;
  const step = direction === "left" ? -1 : 1;

  if (items.some((item) => item !== id && shown(item))) {
    const next = layout.map((list) => list.filter((item) => item !== id));
    next.splice(direction === "left" ? column : column + 1, 0, [id]);
    return accept(next, layout);
  }

  // Alone in its column (as far as can be seen): the nearest column with something shown.
  let neighbour = column + step;
  while (neighbour >= 0 && neighbour < layout.length && !layout[neighbour].some(shown)) neighbour += step;
  if (neighbour < 0 || neighbour >= layout.length) return null;

  const neighbourItems = layout[neighbour];
  const next = layout.map((list) => list.filter((item) => item !== id));
  if (neighbourItems.length < MAX_PER_COLUMN) {
    next[neighbour].push(id);
  } else {
    next.splice(direction === "left" ? neighbour : neighbour + 1, 0, [id]);
  }
  return accept(
    next.filter((list) => list.length > 0),
    layout
  );
}

/* ---------- Grid geometry ---------- */

const round = (value) => Math.round(value * 1e6) / 1e6;

/*
  CSS grid geometry for the shown sections.

  Options:
    visible             Set of shown section ids
    materialsCollapsed  the collapsed materials panel is a small bar: in a stack it gets an
                        "auto" row at the top or bottom of the grid instead of a share
    pdfShare            PDF's fraction of the height when the PDF and notebook are stacked
                        next to each other (the divider between them changes it)
    widths              { [column key]: size } set by the column dividers: px for a column
                        of materials / assistant, a flex weight (fr) for a PDF / notebook column

  Returns:
    columns   [{ key, track, flex, members, px }]   key: columnKey(members); track: CSS track
              size; flex: holds PDF or notebook; px: a resized fixed column's width
    rows      CSS row track sizes
    place     { [id]: { column, rowStart, rowEnd, compact } }  1-based grid lines
    order     { [id]: n }   reading order (column by column), used when stacked on one column
    divider   null, or { column, rowStart, rowEnd, upper, lower, pairStart, pairEnd } for the
              PDF/notebook divider (placed at the top edge of the lower section)
    maxStack  the most full-size sections stacked in one column
*/
export function computeGrid(layout, { visible, materialsCollapsed = false, pdfShare = 0.5, widths = {} }) {
  const columns = layout.map((items) => items.filter((id) => visible.has(id))).filter((items) => items.length > 0);
  const order = Object.fromEntries(layout.flat().map((id, index) => [id, index]));

  const info = columns.map((items) => {
    const isCompact = (id) => id === "materials" && materialsCollapsed && items.length > 1;
    const autoTop = isCompact(items[0]);
    const autoBottom = !autoTop && isCompact(items[items.length - 1]);
    const flexIds = items.filter((_, index) => !(index === 0 && autoTop) && !(index === items.length - 1 && autoBottom));

    const weights = flexIds.map(() => 1);
    let pair = null;
    for (let index = 0; index < flexIds.length - 1; index += 1) {
      const both = [flexIds[index], flexIds[index + 1]];
      if (both.includes("pdf") && both.includes("notebook")) {
        const upperShare = flexIds[index] === "pdf" ? pdfShare : 1 - pdfShare;
        weights[index] = 2 * upperShare;
        weights[index + 1] = 2 * (1 - upperShare);
        pair = { upper: flexIds[index], lower: flexIds[index + 1] };
        break;
      }
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let start = 0;
    const spans = {};
    flexIds.forEach((id, index) => {
      const end = index === flexIds.length - 1 ? 1 : round(start + weights[index] / total);
      spans[id] = [start, end];
      start = end;
    });
    return { items, autoTop, autoBottom, spans, pair, isCompact };
  });

  const hasTop = info.some((column) => column.autoTop);
  const hasBottom = info.some((column) => column.autoBottom);
  const breakpoints = [...new Set(info.flatMap((column) => Object.values(column.spans).flat()))].sort((a, b) => a - b);

  const rows = [];
  if (hasTop) rows.push("auto");
  for (let index = 1; index < breakpoints.length; index += 1) {
    rows.push(`minmax(0, ${round(breakpoints[index] - breakpoints[index - 1])}fr)`);
  }
  if (hasBottom) rows.push("auto");
  const lastLine = rows.length + 1;
  const lineOf = (fraction) => 1 + (hasTop ? 1 : 0) + breakpoints.indexOf(fraction);

  const place = {};
  let divider = null;
  info.forEach((column, columnIndex) => {
    const gridColumn = columnIndex + 1;
    column.items.forEach((id, index) => {
      if (index === 0 && column.autoTop) {
        place[id] = { column: gridColumn, rowStart: 1, rowEnd: 2, compact: true };
      } else if (index === column.items.length - 1 && column.autoBottom) {
        place[id] = { column: gridColumn, rowStart: lastLine - 1, rowEnd: lastLine, compact: true };
      } else {
        const [from, to] = column.spans[id];
        place[id] = {
          column: gridColumn,
          rowStart: from === 0 && !column.autoTop ? 1 : lineOf(from),
          rowEnd: to === 1 && !column.autoBottom ? lastLine : lineOf(to),
          compact: column.isCompact(id), // a collapsed bar in the middle of a stack
        };
      }
    });
    if (column.pair) {
      const upper = place[column.pair.upper];
      const lower = place[column.pair.lower];
      divider = {
        column: gridColumn,
        rowStart: lower.rowStart,
        rowEnd: lower.rowEnd,
        upper: column.pair.upper,
        lower: column.pair.lower,
        pairStart: upper.rowStart,
        pairEnd: lower.rowEnd,
      };
    }
  });

  const columnSpecs = columns.map((items) => {
    const key = columnKey(items);
    const flex = items.includes("pdf") || items.includes("notebook");
    const size = widths[key];
    if (flex) return { key, track: `minmax(0, ${size ?? 1}fr)`, flex, members: items, px: null };
    if (size) return { key, track: `${size}px`, flex, members: items, px: size };
    const defaults = items.map((id) =>
      id === "assistant" ? "var(--ws-assistant-w)" : materialsCollapsed ? "var(--ws-collapsed-w)" : "var(--ws-materials-w)"
    );
    const unique = [...new Set(defaults)];
    // A collapsed bar stacked with the assistant takes the assistant's width.
    const sized = unique.length > 1 ? unique.filter((width) => width !== "var(--ws-collapsed-w)") : unique;
    const track = sized.length === 1 ? sized[0] : `max(${sized.join(", ")})`;
    return { key, track, flex, members: items, px: null };
  });

  const maxStack = Math.max(...info.map((column) => column.items.filter((id) => !column.isCompact(id)).length));

  return { columns: columnSpecs, rows, place, order, divider, maxStack };
}

/*
  Narrowest width (px) the arrangement needs, for the "stack everything" fallback.
  `materials` is the materials panel's current width (collapsed or expanded).
*/
export function minimumWidth(columns, { materials, assistant, flexMin, gap, padding }) {
  const widthOf = (spec) =>
    spec.flex ? flexMin : spec.px ?? Math.max(...spec.members.map((id) => (id === "assistant" ? assistant : materials)));
  return columns.reduce((sum, spec) => sum + widthOf(spec), 0) + gap * Math.max(0, columns.length - 1) + padding * 2;
}

/* Identifies a column by its shown sections, for its width (a rearranged column starts at its default width). */
export function columnKey(members) {
  return members.join("+");
}

export const FIXED_MIN = 200;
export const FIXED_MAX = 640;
export const FLEX_MIN = 240;

/*
  New widths after dragging the divider between two neighbouring columns by `dx` px.
  `left` / `right`: { key, flex, width (rendered px) }; `widths` / `weights`: the current
  sizes (see computeGrid). A materials / assistant column gets a px width (FIXED_MIN…FIXED_MAX);
  between two PDF / notebook columns, their flex weights are shared out by the new widths.
  Returns the new `widths` object, or the same one when nothing changes.
*/
export function resizeColumns(widths, left, right, dx) {
  const clampFixed = (value) => Math.round(Math.min(FIXED_MAX, Math.max(FIXED_MIN, value)));
  if (!left.flex) {
    // A flex column on the right shrinks with it; don't squeeze a fixed neighbour below its minimum.
    const room = right.flex ? right.width - FLEX_MIN : right.width - FIXED_MIN;
    const width = clampFixed(left.width + Math.min(dx, Math.max(0, room)));
    const next = { ...widths, [left.key]: width };
    if (!right.flex) next[right.key] = clampFixed(right.width - (width - left.width));
    return width === widths[left.key] ? widths : next;
  }
  if (!right.flex) {
    const room = left.width - FLEX_MIN;
    const width = clampFixed(right.width - Math.max(dx, -Math.max(0, room)));
    return width === widths[right.key] ? widths : { ...widths, [right.key]: width };
  }
  const total = left.width + right.width;
  if (total <= 0) return widths;
  const leftWidth = Math.min(total - FLEX_MIN, Math.max(FLEX_MIN, left.width + dx));
  const weight = (widths[left.key] ?? 1) + (widths[right.key] ?? 1);
  const leftWeight = Math.round((weight * leftWidth) / total * 1000) / 1000;
  return { ...widths, [left.key]: leftWeight, [right.key]: Math.round((weight - leftWeight) * 1000) / 1000 };
}
