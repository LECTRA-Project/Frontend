import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../../../components/ui/Icon.jsx";
import { DEMO_USER } from "../../../app/demoUser.js";

/*
  The small menu that opens under the avatar.
  Closes when the user clicks outside it, presses Escape, or chooses a row.
*/
export default function ProfileMenu({ onClose }) {
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    // Focus the first row so keyboard users can start right away.
    menuRef.current?.querySelector("button")?.focus();

    function handleClickOutside(event) {
      // Ignore clicks on the avatar itself — it toggles the menu on its own.
      const clickedAvatar = event.target.closest(".ws-header__avatar");
      if (!menuRef.current?.contains(event.target) && !clickedAvatar) onClose();
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function goTo(path) {
    onClose();
    navigate(path);
  }

  return (
    <div className="profile-menu" ref={menuRef} role="menu" aria-label="Profile menu">
      <div className="profile-menu__user">
        <span className="avatar avatar--lg">{DEMO_USER.initials}</span>
        <div>
          <p className="profile-menu__name">{DEMO_USER.name}</p>
          <p className="profile-menu__email">{DEMO_USER.email}</p>
        </div>
      </div>

      <div className="profile-menu__group">
        <MenuRow icon="user" label="My profile" onClick={() => goTo("/profile")} />
        <MenuRow icon="sliders" label="Account settings" onClick={() => goTo("/settings")} />
        <MenuRow icon="chart" label="Statistics" onClick={() => goTo("/statistics")} />
        {/* No help page exists yet, so this row is shown but marked as coming later. */}
        <MenuRow icon="help" label="Help & Support" hint="Later" disabled />
      </div>

      <div className="profile-menu__group">
        <MenuRow icon="logout" label="Sign out" muted onClick={() => goTo("/")} />
      </div>
    </div>
  );
}

function MenuRow({ icon, label, hint, muted = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`profile-menu__row ${muted ? "profile-menu__row--muted" : ""}`}
      aria-disabled={disabled || undefined}
      title={disabled ? `${label} will be added in a later phase` : undefined}
      onClick={disabled ? undefined : onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {hint && <span className="profile-menu__hint">{hint}</span>}
    </button>
  );
}
