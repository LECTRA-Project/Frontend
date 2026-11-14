import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import Icon from "../../../components/ui/Icon.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { getInitials, useAuth } from "../../auth/authContext.js";

/*
  The small menu that opens under the avatar.
  Closes when the user clicks outside it, presses Escape, or chooses a row.
*/
export default function ProfileMenu({ onClose }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
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

  // Clearing the session makes RequireAuth send the user to the sign-in screen.
  function signOut() {
    onClose();
    logout();
  }

  return (
    <div className="profile-menu" ref={menuRef} role="menu" aria-label={t("Profile menu")}>
      <div className="profile-menu__user">
        <span className="avatar avatar--lg">{getInitials(user)}</span>
        <div>
          <p className="profile-menu__name">{user?.full_name}</p>
          <p className="profile-menu__email">{user?.email}</p>
        </div>
      </div>

      <div className="profile-menu__group">
        <MenuRow icon="user" label={t("My profile")} onClick={() => goTo("/profile")} />
        <MenuRow icon="sliders" label={t("Account settings")} onClick={() => goTo("/settings")} />
        <MenuRow icon="chart" label={t("Statistics")} onClick={() => goTo("/statistics")} />
        {/* No help page exists yet, so this row is shown but marked as coming later. */}
        <MenuRow icon="help" label={t("Help & Support")} hint={t("Later")} disabled />
      </div>

      <div className="profile-menu__group">
        <MenuRow icon="logout" label={t("Sign out")} muted onClick={signOut} />
      </div>
    </div>
  );
}

function MenuRow({ icon, label, hint, muted = false, disabled = false, onClick }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="menuitem"
      className={`profile-menu__row ${muted ? "profile-menu__row--muted" : ""}`}
      aria-disabled={disabled || undefined}
      title={disabled ? t("{feature} will be added in a later phase", { feature: label }) : undefined}
      onClick={disabled ? undefined : onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
      {hint && <span className="profile-menu__hint">{hint}</span>}
    </button>
  );
}
