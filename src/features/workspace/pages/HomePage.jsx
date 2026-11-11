import { useOutletContext } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { formatFileSize, groupOf } from "../../../services/materials/materialTypes.js";

const RECENT_LIMIT = 5;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/*
  Home / Welcome screen in the centre panel (/workspace/home). New users land here
  after creating an account (see GuestOnly in RouteGuards.jsx).

  "Recent study materials" lists the student's real uploads, newest first. With none,
  it shows an empty state; nothing is made up.

  Outlet context `home` (from WorkspaceLayout):
    materials, status         the course materials (see useCourseMaterials)
    onUploadClick             opens the upload dialog
    onBrowseMaterials         opens the course-materials panel
    onOpenMaterial(material)  opens a material, exactly like clicking it in the panel
*/
export default function HomePage() {
  const { home } = useOutletContext();
  const { materials, status, onUploadClick, onBrowseMaterials, onOpenMaterial } = home;

  const recent = [...materials].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, RECENT_LIMIT);

  return (
    <section className="panel center-panel home" aria-labelledby="home-title">
      <div className="home__content">
        <div className="home__welcome">
          <span className="home__icon">
            <Icon name="book" />
          </span>
          <h2 id="home-title" className="home__title">
            Welcome to LECTRA
          </h2>
          <p className="home__text">
            Upload your lecture notes, PDFs, slides or notebooks to get started. Open a PDF to read it right above your
            Python notebook.
          </p>
          <div className="home__actions">
            <Button variant="primary" icon="upload" onClick={onUploadClick}>
              Upload materials
            </Button>
            <Button icon="folder" onClick={onBrowseMaterials}>
              Browse course materials
            </Button>
          </div>
        </div>

        <section className="home__recent" aria-labelledby="home-recent-title">
          <h3 id="home-recent-title" className="home__recent-title">
            Recent study materials
          </h3>

          {status === "loading" ? (
            <p className="home__recent-message" role="status">
              Loading your materials…
            </p>
          ) : recent.length === 0 ? (
            <div className="home__recent-empty">
              <span className="home__recent-empty-icon">
                <Icon name="fileText" />
              </span>
              <p className="home__recent-empty-title">No recent study materials</p>
              <p className="home__recent-message">Materials you upload will appear here.</p>
            </div>
          ) : (
            <ul className="home__recent-list">
              {recent.map((material) => {
                const group = groupOf(material.type);
                return (
                  <li key={material.id}>
                    <button type="button" className="material-row home__recent-row" onClick={() => onOpenMaterial(material)}>
                      <Icon name={group.icon} />
                      <span className="material-row__text">
                        <span className="material-row__name">{material.name}</span>
                        <span className="material-row__meta">
                          {group.short} · {formatFileSize(material.size)} · Added {dateFormat.format(new Date(material.addedAt))}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
