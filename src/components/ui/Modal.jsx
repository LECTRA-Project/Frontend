import { useEffect, useId, useRef, useState } from "react";
import IconButton from "./IconButton.jsx";
import { useI18n } from "../../i18n/i18n.js";

/*
  Modal — a dialog shown over the page with a darkened background (scrim).
  It closes when the user presses Escape, clicks the scrim, or clicks the close button.

  Props:
    title        text in the dialog header
    titleExtra   optional element shown after the title (e.g. "PDF · 12 pages")
    icon         optional element shown before the title
    width        dialog width in px
    onClose      called when the dialog should close

  Focus: a field with autoFocus keeps the focus (else the dialog itself gets it),
  Tab and Shift+Tab stay inside the dialog, and on close the focus goes back to
  the element that opened it (for a Menu item, the Menu's button). When that element is
  gone or hidden by then (e.g. the phone menu holding it closed), the focus goes to the button that
  controls the region it was in (aria-controls, e.g. the menu toggle).
*/

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/* The opener's ancestors with an id, nearest first: to find their toggle if the opener is gone. */
function regionIds(element) {
  const ids = [];
  for (let node = element?.parentElement; node; node = node.parentElement) if (node.id) ids.push(node.id);
  return ids;
}

function restoreFocus({ element, regions }) {
  element?.focus?.();
  // Gone or hidden (focus() then does nothing): the toggle of its region instead.
  if (element && document.activeElement === element) return;
  for (const id of regions) {
    const toggles = [...document.querySelectorAll("[aria-controls]")].filter((node) => node.getAttribute("aria-controls").split(/\s+/).includes(id));
    for (const toggle of toggles) {
      toggle.focus();
      if (document.activeElement === toggle) return;
    }
  }
}

export default function Modal({ title, titleExtra, icon, width = 520, onClose, className = "", children }) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef(null);
  // The element that had the focus when the dialog opened. Read while rendering, before
  // a child's autoFocus moves the focus into the dialog.
  const [opener] = useState(() => ({ element: document.activeElement, regions: regionIds(document.activeElement) }));

  // Keep the latest onClose in a ref so the effect below only runs once per opening.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    // Move keyboard focus into the dialog, unless a child (autoFocus) already has it.
    if (!dialog.contains(document.activeElement)) dialog.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        // Escape belongs to the dialog: it must not also close what is behind it (the phone
        // menu listens on window). React may remove the dialog before that listener runs.
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key === "Tab") trapTab(event);
    }

    // Keeps Tab inside the dialog (only the topmost one when dialogs are stacked).
    function trapTab(event) {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      const elements = [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => !element.closest("[hidden], [inert]"));
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      const inside = dialog.contains(active) && active !== dialog;
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Still in the page: React's StrictMode re-running effects, not a real close.
      if (dialog.isConnected) return;
      // Give the focus back to the opener, unless something else (e.g. a next dialog) took it.
      const active = document.activeElement;
      const focusLost = !active || active === document.body || !active.isConnected;
      if (focusLost) restoreFocus(opener);
    };
  }, [opener]);

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
          <IconButton icon="close" label={t("Close")} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}
