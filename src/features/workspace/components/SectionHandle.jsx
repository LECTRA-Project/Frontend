import { useRef } from "react";

import Menu from "../../../components/ui/Menu.jsx";
import { SECTION_LABELS } from "../sectionLayout.js";

const DRAG_THRESHOLD = 6; // px the pointer must travel before a press becomes a drag

/*
  The grip in a workspace section's header.

  - Drag it (mouse, touch or pen) to move the whole section; the workspace shows where
    it can go. Only the grip starts a section drag, so the panel's own buttons, editors,
    text selection and notebook-cell grips are unaffected.
  - Click it (or press Enter / Space) for a menu: Move left / right / up / down and
    Reset layout — the keyboard way to rearrange the workspace.

  Props:
    section   "materials" | "pdf" | "notebook" | "assistant"
    sections  the workspace's section API (see WorkspaceLayout):
                menuItems(section)          the move items, disabled when not possible
                startDrag(section, point)   point: { x, y }
                moveDrag(point)
                endDrag(point)              drops on the highlighted target, if any
                cancelDrag()
*/
export default function SectionHandle({ section, sections }) {
  const press = useRef(null); // { pointerId, x, y, dragging }
  const suppressClick = useRef(false);
  const label = SECTION_LABELS[section];

  function handlePointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!current.dragging) {
      if (Math.hypot(point.x - current.x, point.y - current.y) < DRAG_THRESHOLD) return;
      current.dragging = true;
      sections.startDrag(section, point);
    }
    event.preventDefault(); // no text selection or scrolling while moving a section
    sections.moveDrag(point);
  }

  function finish(event, drop) {
    const current = press.current;
    if (!current || current.pointerId !== event.pointerId) return;
    press.current = null;
    if (!current.dragging) return; // a plain click: the menu opens as usual
    suppressClick.current = true; // the click that follows a drag must not open the menu
    if (drop) sections.endDrag({ x: event.clientX, y: event.clientY });
    else sections.cancelDrag();
  }

  return (
    <Menu
      className="section-handle"
      icon="grip"
      align="start"
      label={`Move ${label}`}
      items={sections.menuItems(section)}
      triggerProps={{
        "data-section-handle": section,
        title: `Drag to move ${label}, or click for move options`,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: (event) => finish(event, true),
        onPointerCancel: (event) => finish(event, false),
        onClickCapture: (event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        },
      }}
    />
  );
}
