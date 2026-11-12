import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import Brand from "../../../components/Brand.jsx";
import Button from "../../../components/ui/Button.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import { getInitials, useAuth } from "../../auth/authContext.js";

/*
  The top bar shown on the workspace and on the profile pages:
  menu button (workspace only) and LECTRA logo on the left, Exam button and the student
  avatar on the right. The logo goes to Home; Home has no Exam button.

  Props (workspace only):
    materialsOpen      whether the Course materials menu is shown
    onToggleMaterials  shows / hides it (no menu button without it)
*/
export default function WorkspaceHeader({
  materialsOpen = false,
  onToggleMaterials = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const isExamOpen = location.pathname === "/workspace/exam";
  const isHome = location.pathname === "/workspace/home";

  return (
    <header className="ws-header">
      <div className="ws-header__start">
        {onToggleMaterials && (
          <IconButton
            icon="menu"
            label={
              materialsOpen ? "Hide course materials" : "Show course materials"
            }
            aria-expanded={materialsOpen}
            aria-controls="course-materials"
            onClick={onToggleMaterials}
          />
        )}
        <Link
          to="/workspace/home"
          className="ws-header__home"
          aria-label="LECTRA — go to home"
        >
          <Brand />
        </Link>
      </div>

      <div className="ws-header__actions">
        {!isHome && (
          <Button
            icon="graduation"
            active={isExamOpen}
            aria-pressed={isExamOpen}
            onClick={() =>
              navigate(isExamOpen ? "/workspace" : "/workspace/exam")
            }
          >
            Exam
          </Button>
        )}

        <div className="ws-header__profile">
          <button
            type="button"
            className="avatar ws-header__avatar"
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {getInitials(user)}
          </button>
          {menuOpen && <ProfileMenu onClose={closeMenu} />}
        </div>
      </div>
    </header>
  );
}
