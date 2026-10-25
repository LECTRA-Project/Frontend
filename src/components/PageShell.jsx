import { Link } from "react-router-dom";

import WorkspaceHeader from "../features/workspace/components/WorkspaceHeader.jsx";
import Icon from "./ui/Icon.jsx";
import "../features/workspace/workspace.css"; // header styles
import "./page-shell.css";

/*
  The frame shared by My profile, Account settings and Statistics:
  the workspace header, a "Back to workspace" link, the page title and a subtitle.
*/
export default function PageShell({ title, subtitle, children }) {
  return (
    <div className="page-shell">
      <WorkspaceHeader />
      <main className="page-shell__main">
        <Link to="/workspace" className="page-shell__back">
          <Icon name="arrowLeft" size={16} />
          Back to workspace
        </Link>
        <h1 className="page-shell__title">{title}</h1>
        <p className="page-shell__subtitle">{subtitle}</p>
        {children}
      </main>
    </div>
  );
}
