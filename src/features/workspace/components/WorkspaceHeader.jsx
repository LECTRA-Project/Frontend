import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import Brand from "../../../components/Brand.jsx";
import Button from "../../../components/ui/Button.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import { DEMO_USER } from "../../../app/demoUser.js";

/*
  The top bar shown on the workspace and on the profile pages:
  LECTRA logo on the left, Exam button and the student avatar on the right.
*/
export default function WorkspaceHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const isExamOpen = location.pathname === "/workspace/exam";

  return (
    <header className="ws-header">
      <Link to="/workspace" className="ws-header__home" aria-label="LECTRA — go to workspace">
        <Brand />
      </Link>

      <div className="ws-header__actions">
        <Button
          icon="graduation"
          active={isExamOpen}
          aria-pressed={isExamOpen}
          onClick={() => navigate(isExamOpen ? "/workspace" : "/workspace/exam")}
        >
          Exam
        </Button>

        <div className="ws-header__profile">
          <button
            type="button"
            className="avatar ws-header__avatar"
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {DEMO_USER.initials}
          </button>
          {menuOpen && <ProfileMenu onClose={closeMenu} />}
        </div>
      </div>
    </header>
  );
}
