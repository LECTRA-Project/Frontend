import { useRef } from "react";

import { resizeStep } from "../chatLayout.js";

/*
  The grip on the left edge of a docked panel (material viewer, notebook).
  Drag it to resize; the left and right arrow keys step the width; a double-click resets it.

  Props:
    label         accessible name (says how to use it)
    onResize(x)   called with the pointer's clientX while dragging
    onStep(px)    called with +32 (wider) or -32 (narrower) for the arrow keys
    onReset()     double-click: back to the default width
    onResizing(active)  a drag started / ended
*/
export default function ResizeHandle({ label, onResize, onStep, onReset, onResizing }) {
  const dragging = useRef(false);

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragging.current = true;
    onResizing?.(true);
  }

  function handlePointerMove(event) {
    if (dragging.current) onResize(event.clientX);
  }

  function finish() {
    if (!dragging.current) return;
    dragging.current = false;
    onResizing?.(false);
  }

  function handleKeyDown(event) {
    const step = resizeStep(event.key);
    if (step === undefined) return;
    event.preventDefault();
    onStep(step);
  }

  return (
    <button
      type="button"
      className="resize-handle"
      aria-label={label}
      title="Drag to resize · double-click to reset"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    >
      <span className="resize-handle__grip" />
    </button>
  );
}
