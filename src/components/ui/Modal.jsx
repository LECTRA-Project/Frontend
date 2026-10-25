import { useEffect, useId, useRef } from "react";
import IconButton from "./IconButton.jsx";

/*
  Modal — a dialog shown over the page with a darkened background (scrim).
  It closes when the user presses Escape, clicks the scrim, or clicks the close button.

  Props:
    title        text in the dialog header
    titleExtra   optional element shown after the title (e.g. "PDF · 12 pages")
    icon         optional element shown before the title
    width        dialog width in px
    onClose      called when the dialog should close
*/
export default function Modal({ title, titleExtra, icon, width = 520, onClose, className = "", children }) {
  const titleId = useId();
  const dialogRef = useRef(null);

  // Keep the latest onClose in a ref so the effect below only runs once per opening.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    // Move keyboard focus into the dialog when it opens, and back when it closes.
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        // Only close when the click starts on the scrim itself, not inside the dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal ${className}`}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal__header">
          {icon}
          <h2 id={titleId} className="modal__title">
            {title}
            {titleExtra}
          </h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
