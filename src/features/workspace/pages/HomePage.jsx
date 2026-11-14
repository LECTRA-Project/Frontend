import { useOutletContext } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { groupOf } from "../../../services/materials/materialTypes.js";
import { useAuth } from "../../auth/authContext.js";
import { dateLocale, t, useI18n } from "../../../i18n/i18n.js";

const RECENT_LIMIT = 20;
const timeFormat = () => new Intl.DateTimeFormat(dateLocale(undefined), { hour: "2-digit", minute: "2-digit" });
const dateFormat = () => new Intl.DateTimeFormat(dateLocale(undefined), { dateStyle: "medium" });

/* "Good morning" / "Good afternoon" / "Good evening" (with the first name, when known) for the given time. */
function greetingFor(name, date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return name ? t("Good morning, {name}", { name }) : t("Good morning");
  if (hour >= 12 && hour < 17) return name ? t("Good afternoon, {name}", { name }) : t("Good afternoon");
  return name ? t("Good evening, {name}", { name }) : t("Good evening");
}

/* "today", "yesterday" or the date, for a day heading: { key, label }. */
function dayLabel(date, now = new Date()) {
  const startOf = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86400000);
  if (days === 0) return { key: "today", label: t("Today") };
  if (days === 1) return { key: "yesterday", label: t("Yesterday") };
  const label = dateFormat().format(date);
  return { key: label, label };
}

/* Materials, newest upload first, grouped by day: [{ key, label, items }]. */
function groupByDay(materials) {
  const uploaded = (item) => item.lecture?.uploaded_at ?? "";
  const sorted = [...materials].sort((a, b) => uploaded(b).localeCompare(uploaded(a))).slice(0, RECENT_LIMIT);
  const groups = [];
  for (const item of sorted) {
    const date = uploaded(item) ? new Date(uploaded(item)) : null;
    const { key, label } = date && !Number.isNaN(date.getTime()) ? dayLabel(date) : { key: "earlier", label: t("Earlier") };
    const last = groups.at(-1);
    if (last?.key === key) last.items.push({ item, date });
    else groups.push({ key, label, items: [{ item, date }] });
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
    uploads                   files being sent: { id, name, progress, error } (useLectureLibrary)
    loading                   true while the library is first loaded
    onUploadClick             opens the upload dialog
    onDismissUpload(id)       removes a failed upload from the list
    onOpenMaterial(material)  opens a material in the workspace
*/
export default function HomePage() {
  const { t } = useI18n();
  const { home } = useOutletContext();
  const { materials, uploads = [], loading, onUploadClick, onDismissUpload, onOpenMaterial } = home;
  const { user } = useAuth();
  const firstName = (user?.full_name ?? "").trim().split(/\s+/)[0];
  const groups = groupByDay(materials);
  // Files being uploaded show first, under Today (a first upload shows the card too).
  if (uploads.length && groups[0]?.key !== "today") groups.unshift({ key: "today", label: t("Today"), items: [] });

  const greeting = (
    <h2 id="home-title" className="home__greeting">
      {greetingFor(firstName)}
    </h2>
  );
  const uploadButton = (
    <Button variant="primary" icon="upload" onClick={onUploadClick}>
      {t("Upload materials")}
    </Button>
  );

  return (
    <section className={`panel center-panel home ${groups.length ? "home--has-files" : ""}`} aria-labelledby="home-title">
      <div className="home__content">
        {loading && materials.length === 0 ? (
          <div className="home__welcome">
            {greeting}
            <p className="home__text" role="status">
              {t("Loading your materials…")}
            </p>
          </div>
        ) : groups.length === 0 ? (
          // No uploads yet: greeting, what LECTRA does and the upload button, centred.
          <div className="home__welcome">
            {greeting}
            <p className="home__text">
              {t(
                "Your study space for lectures: read your PDFs and slides, run Python notebooks, and ask the study assistant questions answered from your own materials.",
              )}
            </p>
            <div className="home__actions">{uploadButton}</div>
          </div>
        ) : (
          <>
            {greeting}
            <section className="home__recent" aria-labelledby="home-recent-title">
              <div className="home__recent-head">
                <h3 id="home-recent-title" className="home__recent-title">
                  {t("Recent uploads")}
                </h3>
                {uploadButton}
              </div>
              {groups.map((group) => (
                <div key={group.key} className="home__day">
                  <h4 className="home__day-title">{group.label}</h4>
                  <ul className="home__recent-list" aria-label={group.label}>
                    {group.key === "today" &&
                      uploads.map((upload) => <UploadRow key={upload.id} upload={upload} onDismiss={onDismissUpload} />)}
                    {group.items.map(({ item, date }) => (
                      <li key={item.id}>
                        <button type="button" className="material-row home__recent-row" onClick={() => onOpenMaterial(item)}>
                          <Icon name={groupOf(item.type)?.icon ?? "fileText"} />
                          <span className="material-row__text">
                            <span className="material-row__name">{item.name}</span>
                            <span className="material-row__meta">
                              {item.meta}
                              {date && ` · ${timeFormat().format(date)}`}
                            </span>
                            {item.status === "processing" && (
                              <span className="home__state">
                                <span className="home__spinner" aria-hidden="true" />
                                {t("Processing…")}
                              </span>
                            )}
                            {item.status === "failed" && (
                              <span className="home__state home__state--error">{t("Processing failed — open it to retry")}</span>
                            )}
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

/*
  A file being uploaded: a progress bar while it is sent, then "Processing…" while the
  server reads it (it answers only once the text is extracted), or the error.
*/
function UploadRow({ upload, onDismiss }) {
  const { t } = useI18n();
  const sent = upload.progress >= 100;
  return (
    <li className="material-row home__recent-row home__upload" aria-busy={!upload.error}>
      <Icon name={upload.error ? "alert" : "upload"} />
      <span className="material-row__text">
        <span className="material-row__name">{upload.name}</span>
        {upload.error ? (
          <span className="home__state home__state--error" role="alert">
            {t("Upload failed: {error}", { error: upload.error })}
          </span>
        ) : (
          <>
            <span className="home__state" role="status">
              <span className="home__spinner" aria-hidden="true" />
              {sent ? t("Processing…") : t("Uploading… {progress}%", { progress: upload.progress })}
            </span>
            <span className={`material-progress ${sent ? "material-progress--busy" : ""}`} aria-hidden="true">
              <span className="material-progress__bar" style={{ width: sent ? undefined : `${upload.progress}%` }} />
            </span>
          </>
        )}
      </span>
      {upload.error && <IconButton icon="close" label={t("Dismiss {name}", { name: upload.name })} onClick={() => onDismiss(upload.id)} />}
    </li>
  );
}
