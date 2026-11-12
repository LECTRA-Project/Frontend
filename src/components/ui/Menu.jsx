import { useEffect, useId, useRef, useState } from "react";

import Icon from "./Icon.jsx";

/*
  Menu — a button that opens a small list of actions.

  Props:
    label    accessible name of the button (also its tooltip)
    icon     icon shown on the button (default "more")
    text     optional visible text next to the icon
    items    array of { label, icon?, onSelect, disabled?, danger?, key? } or "separator"
             (key: when labels can repeat, e.g. file names)
    align    "end" (default) or "start": which edge of the button the list lines up with
    triggerProps  optional extra props for the button (e.g. pointer handlers of a drag handle)

  Keyboard: arrow keys move between items, Enter/Space choose, Escape closes.
*/
export default function Menu({ label, icon = "more", text, items, align = "end", className = "", triggerProps = {} }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  const enabledItems = () => [...(listRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? [])];

  useEffect(() => {
    if (!open) return undefined;
    enabledItems()[0]?.focus();

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function close({ restoreFocus = true } = {}) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function handleListKeyDown(event) {
    const elements = enabledItems();
    const index = elements.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      elements[(index + step + elements.length) % elements.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      elements[event.key === "Home" ? 0 : elements.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      close({ restoreFocus: false });
    }
  }

  return (
    <div ref={rootRef} className={`menu ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className={text ? "btn btn--ghost btn--sm" : "icon-btn"}
        aria-label={text ? undefined : label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...triggerProps}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={icon} />
        {text && <span className="menu__text">{text}</span>}
      </button>

      {open && (
        <div
          ref={listRef}
          id={menuId}
          className={`menu__list menu__list--${align}`}
          role="menu"
          aria-label={label}
          onKeyDown={handleListKeyDown}
        >
          {items.map((item, index) =>
            item === "separator" ? (
              <div key={`separator-${index}`} className="menu__separator" role="separator" />
            ) : (
              <button
                key={item.key ?? item.label}
                type="button"
                role="menuitem"
                className={`menu__item ${item.danger ? "menu__item--danger" : ""}`}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} size={16} />}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
