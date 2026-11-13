import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import Brand from "../../../components/Brand.jsx";
import Button from "../../../components/ui/Button.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import { getInitials, useAuth } from "../../auth/authContext.js";

/*
  The top bar shown on the workspace and on the profile pages:
  menu button (workspace, phone width only) and LECTRA logo on the left; the Notebook
  toggle (workspace only), the Exam button and the student avatar on the right. The logo
  goes to Home; Home has no Exam button.

  Props (workspace only):
    menuOpen, onToggleMenu          the chat menu (the button is only shown on phones,
                                    where the menu is an overlay)
    notebookOpen, onToggleNotebook  shows / hides the notebook panel
*/
function withoutExam(search) {
  const params = new URLSearchParams(search);
  params.delete("exam");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export default function WorkspaceHeader({ menuOpen = false, onToggleMenu = null, notebookOpen = false, onToggleNotebook = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [menuOpenProfile, setProfileOpen] = useState(false);
  const closeMenu = useCallback(() => setProfileOpen(false), []);

  const isExamOpen = location.pathname === "/workspace/exam";
  const isHome = location.pathname === "/workspace/home";

  return (
    <header className="ws-header">
      <div className="ws-header__start">
        {onToggleMenu && (
          <IconButton
            icon="menu"
            className="ws-header__menu"
            label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="chat-menu"
            onClick={onToggleMenu}
          />
        )}
        <Link to="/workspace/home" className="ws-header__home" aria-label="LECTRA — go to home">
          <Brand />
        </Link>
      </div>

      <div className="ws-header__actions">
        {onToggleNotebook && (
          <Button icon="code" active={notebookOpen} aria-pressed={notebookOpen} onClick={onToggleNotebook}>
            <span className="ws-header__label">Notebook</span>
          </Button>
        )}
        {!isHome && (
          <Button
            icon="graduation"
            className="ws-header__exam"
            active={isExamOpen}
            aria-pressed={isExamOpen}
            // The open chat and material (?chat=…&lecture=…) stay open across the Exam view;
            // the exam (?exam=…) belongs to the Exam view only, which opens on its setup step.
            onClick={() => navigate({ pathname: isExamOpen ? "/workspace" : "/workspace/exam", search: withoutExam(location.search) })}
          >
            <span className="ws-header__label">Exam</span>
          </Button>
        )}

        <div className="ws-header__profile">
          <button
            type="button"
            className="avatar ws-header__avatar"
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={menuOpenProfile}
            onClick={() => setProfileOpen((open) => !open)}
          >
            {getInitials(user)}
          </button>
          {menuOpenProfile && <ProfileMenu onClose={closeMenu} />}
        </div>
      </div>
    </header>
  );
}
