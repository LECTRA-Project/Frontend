import { Link } from "react-router-dom";

import WorkspaceHeader from "../features/workspace/components/WorkspaceHeader.jsx";
import Icon from "./ui/Icon.jsx";
import { useI18n } from "../i18n/i18n.js";
import "../features/workspace/workspace.css"; // header styles
import "./page-shell.css";

/*
  The frame shared by My profile, Account settings and Statistics:
  the workspace header, a "Back to workspace" link, the page title and a subtitle.
*/
export default function PageShell({ title, subtitle, children }) {
  const { t } = useI18n();
  return (
    <div className="page-shell">
      <WorkspaceHeader />
      <main className="page-shell__main">
        <Link to="/workspace" className="page-shell__back">
          <Icon name="arrowLeft" size={16} />
          {t("Back to workspace")}
        </Link>
        <h1 className="page-shell__title">{title}</h1>
        <p className="page-shell__subtitle">{subtitle}</p>
        {children}
      </main>
    </div>
  );
}
