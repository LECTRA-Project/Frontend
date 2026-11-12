import { useOutletContext } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { groupOf } from "../../../services/materials/materialTypes.js";
import { useAuth } from "../../auth/authContext.js";

const RECENT_LIMIT = 20;
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/* "Good morning" / "Good afternoon" / "Good evening" for the given time. */
function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/* "Today", "Yesterday" or the date, for a day heading. */
function dayLabel(date, now = new Date()) {
  const startOf = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return dateFormat.format(date);
}

/* Materials, newest upload first, grouped by day: [{ label, items }]. */
function groupByDay(materials) {
  const uploaded = (item) => item.lecture?.uploaded_at ?? "";
  const sorted = [...materials].sort((a, b) => uploaded(b).localeCompare(uploaded(a))).slice(0, RECENT_LIMIT);
  const groups = [];
  for (const item of sorted) {
    const date = uploaded(item) ? new Date(uploaded(item)) : null;
    const label = date && !Number.isNaN(date.getTime()) ? dayLabel(date) : "Earlier";
    const last = groups.at(-1);
    if (last?.label === label) last.items.push({ item, date });
    else groups.push({ label, items: [{ item, date }] });
  }
  return groups;
}

/*
  Home screen (/workspace/home): where signing in lands. With no uploads: the greeting
  (Good morning, <first name>), a short introduction and Upload materials, centred. Once
  there are uploads: the greeting, then "Recent uploads" (Upload materials on the right of
  its title) with the materials newest first, under Today / Yesterday / date headings. It has no Study assistant;
  opening a material goes to the workspace (WorkspaceLayout's openLecture).

  Outlet context `home` (from WorkspaceLayout):
    materials                 the lecture materials (toMaterial items, see lectures/materialTypes.js)
    loading                   true while the library is first loaded
    onUploadClick             opens the upload dialog
    onOpenMaterial(material)  opens a material in the workspace
*/
export default function HomePage() {
  const { home } = useOutletContext();
  const { materials, loading, onUploadClick, onOpenMaterial } = home;
  const { user } = useAuth();
  const firstName = (user?.full_name ?? "").trim().split(/\s+/)[0];
  const groups = groupByDay(materials);

  const greeting = (
    <h2 id="home-title" className="home__greeting">
      {greetingFor()}
      {firstName && `, ${firstName}`}
    </h2>
  );
  const uploadButton = (
    <Button variant="primary" icon="upload" onClick={onUploadClick}>
      Upload materials
    </Button>
  );

  return (
    <section className={`panel center-panel home ${groups.length ? "home--has-files" : ""}`} aria-labelledby="home-title">
      <div className="home__content">
        {loading && materials.length === 0 ? (
          <div className="home__welcome">
            {greeting}
            <p className="home__text" role="status">
              Loading your materials…
            </p>
          </div>
        ) : groups.length === 0 ? (
          // No uploads yet: greeting, what LECTRA does and the upload button, centred.
          <div className="home__welcome">
            {greeting}
            <p className="home__text">
              Your study space for lectures: read your PDFs and slides, run Python notebooks, and ask the study assistant
              questions answered from your own materials.
            </p>
            <div className="home__actions">{uploadButton}</div>
          </div>
        ) : (
          <>
            {greeting}
            <section className="home__recent" aria-labelledby="home-recent-title">
              <div className="home__recent-head">
                <h3 id="home-recent-title" className="home__recent-title">
                  Recent uploads
                </h3>
                {uploadButton}
              </div>
              {groups.map((group) => (
                <div key={group.label} className="home__day">
                  <h4 className="home__day-title">{group.label}</h4>
                  <ul className="home__recent-list" aria-label={group.label}>
                    {group.items.map(({ item, date }) => (
                      <li key={item.id}>
                        <button type="button" className="material-row home__recent-row" onClick={() => onOpenMaterial(item)}>
                          <Icon name={groupOf(item.type)?.icon ?? "fileText"} />
                          <span className="material-row__text">
                            <span className="material-row__name">{item.name}</span>
                            <span className="material-row__meta">
                              {item.meta}
                              {date && ` · ${timeFormat.format(date)}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
