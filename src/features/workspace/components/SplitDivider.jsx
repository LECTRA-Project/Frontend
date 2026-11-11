import { useRef } from "react";

export const MIN_SHARE = 0.2;
export const MAX_SHARE = 0.8;
const KEY_STEP = 0.05;

// Kept to whole percents, so repeated key steps don't drift (0.6, not 0.6000000000000001).
const clamp = (value) => Math.round(Math.min(MAX_SHARE, Math.max(MIN_SHARE, value)) * 100) / 100;

/*
  The horizontal divider between the PDF (above) and the notebook (below) in the
  centre panel's split view. Drag it, or focus it and use the arrow keys / Home / End.

  Props:
    share          fraction of the height given to the PDF (MIN_SHARE…MAX_SHARE)
    onChange       called with the new share
    containerRef   the split container, used to turn the pointer position into a share
    onResizing     called with true while dragging (so the PDF frame doesn't swallow the pointer)
*/
export default function SplitDivider({ share, onChange, containerRef, onResizing }) {
  const dragging = useRef(false);

  function shareAt(clientY) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return share;
    return clamp((clientY - rect.top) / rect.height);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onResizing(true);
  }

  function handlePointerMove(event) {
    if (dragging.current) onChange(shareAt(event.clientY));
  }

  function stopDragging() {
    if (!dragging.current) return;
    dragging.current = false;
    onResizing(false);
  }

  function handleKeyDown(event) {
    const next = {
      ArrowUp: share - KEY_STEP,
      ArrowDown: share + KEY_STEP,
      Home: MIN_SHARE,
      End: MAX_SHARE,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(clamp(next));
  }

  return (
    <div
      className="split-divider"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize PDF and notebook"
      aria-valuemin={Math.round(MIN_SHARE * 100)}
      aria-valuemax={Math.round(MAX_SHARE * 100)}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={`PDF ${Math.round(share * 100)}% of the height`}
      title="Drag to resize the PDF and notebook"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onLostPointerCapture={stopDragging}
      onKeyDown={handleKeyDown}
    >
      <span className="split-divider__grip" aria-hidden="true" />
    </div>
  );
}
