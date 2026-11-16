import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import Brand from "../../../components/Brand.jsx";
import Button from "../../../components/ui/Button.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import ProfileMenu from "./ProfileMenu.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { getInitials, useAuth } from "../../auth/authContext.js";

/*
  The top bar shown on the workspace and on the profile pages:
  menu button (workspace, phone width only) and LECTRA logo on the left; the Notebook
  toggle (workspace only), the Exam button and the student avatar on the right. The logo
  opens a new chat.

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
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [menuOpenProfile, setProfileOpen] = useState(false);
  const closeMenu = useCallback(() => setProfileOpen(false), []);

  const isExamOpen = location.pathname === "/workspace/exam";
  // From a project page the Exam view preselects the project's materials (?project=), and
  // closing it goes back to that project.
  const projectId = location.pathname.match(/^\/workspace\/projects\/([^/]+)$/)?.[1] ?? null;
  function toggleExam() {
    const params = new URLSearchParams(withoutExam(location.search));
    if (isExamOpen) {
      const fromProject = params.get("project");
      params.delete("project");
      const search = params.toString() ? `?${params}` : "";
      if (fromProject && !params.get("chat")) navigate({ pathname: `/workspace/projects/${fromProject}`, search });
      else navigate({ pathname: "/workspace", search });
      return;
    }
    if (projectId) params.set("project", projectId);
    const search = params.toString() ? `?${params}` : "";
    navigate({ pathname: "/workspace/exam", search });
  }

  return (
    <header className="ws-header">
      <div className="ws-header__start">
        {onToggleMenu && (
          <IconButton
            icon="menu"
            className="ws-header__menu"
            label={menuOpen ? t("Close menu") : t("Open menu")}
            aria-expanded={menuOpen}
            aria-controls="chat-menu"
            onClick={onToggleMenu}
          />
        )}
        <Link to="/workspace" className="ws-header__home" aria-label={t("LECTRA — go to home")}>
          <Brand />
        </Link>
      </div>

      <div className="ws-header__actions">
        {onToggleNotebook && (
          <Button icon="code" active={notebookOpen} aria-pressed={notebookOpen} onClick={onToggleNotebook}>
            <span className="ws-header__label">{t("Notebook")}</span>
          </Button>
        )}
        <Button
          icon="graduation"
          className="ws-header__exam"
          active={isExamOpen}
          aria-pressed={isExamOpen}
          // The open chat and material (?chat=…&lecture=…) stay open across the Exam view;
          // the exam (?exam=…) belongs to the Exam view only, which opens on its setup step.
          onClick={toggleExam}
        >
          <span className="ws-header__label">{t("Exam")}</span>
        </Button>

        <div className="ws-header__profile">
          <button
            type="button"
            className="avatar ws-header__avatar"
            aria-label={t("Open profile menu")}
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
