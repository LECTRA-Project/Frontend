import { useRef } from "react";

const KEY_STEP = 24; // px per arrow key press

/*
  The vertical divider in the gap between two side-by-side workspace columns. Drag it, or
  focus it and use the left / right arrow keys, to make the left column wider or narrower
  (the right one gives or takes the space).

  Props:
    leftLabel / rightLabel  names of the two columns' sections, for screen readers
    onResize(dx, phase)     dx: px moved since the drag started (or one key step);
                            phase: "start" | "move" | "key"
    onResizing(active)      true while dragging (so the PDF frame doesn't swallow the pointer)
    style                   grid placement (--slot-column: the left column's grid line)
*/
export default function ColumnDivider({ leftLabel, rightLabel, onResize, onResizing, style }) {
  const startX = useRef(null);

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    startX.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onResize(0, "start");
    onResizing(true);
  }

  function handlePointerMove(event) {
    if (startX.current !== null) onResize(event.clientX - startX.current, "move");
  }

  function stop() {
    if (startX.current === null) return;
    startX.current = null;
    onResizing(false);
  }

  function handleKeyDown(event) {
    const dx = { ArrowLeft: -KEY_STEP, ArrowRight: KEY_STEP }[event.key];
    if (dx === undefined) return;
    event.preventDefault();
    onResize(dx, "key");
  }

  return (
    <div
      className="column-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${leftLabel} and ${rightLabel}`}
      title="Drag to resize"
      tabIndex={0}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={handleKeyDown}
    >
      <span className="column-divider__grip" aria-hidden="true" />
    </div>
  );
}
