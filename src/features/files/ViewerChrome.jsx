import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { t, useI18n } from "../../i18n/i18n.js";

/*
  The parts every material viewer shares (PDF, notes, slides and notebooks):

  ViewerHead     icon, title and meta; then the actions (open in a new tab, download, …),
                 the optional Widen / Restore button (`widen`: { wide, disabled, onToggle },
                 like the notebook's), the optional Switch places button (`switcher`:
                 { label, disabled, title, onClick }) and the close button. `progress`
                 ({ viewed, total, unit }) adds the small "Read 12 of 65" label.
  ReadingLabel   that label: "Read 12 of 65", shortened to "12/65" in a narrow header.
  ViewerBanner   "Opened from a source in the answer: page 12", shown while the viewer is
                 on the place an answer cited.
  ZoomControls   − 100% +  (`label` replaces the percentage, e.g. "Fit")
*/
export function ViewerHead({ icon = "fileText", title, meta, newTabUrl = null, progress = null, children = null, widen = null, switcher = null, onClose }) {
  const { t } = useI18n();
  return (
    <div className="viewer__head">
      <span className="viewer__icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="viewer__titles">
        <h2 className="viewer__title" title={title}>
          {title}
        </h2>
        {meta && <span className="viewer__meta">{meta}</span>}
      </span>
      {progress && <ReadingLabel {...progress} />}
      {children}
      {newTabUrl && (
        <a
          className="icon-btn"
          href={newTabUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("Open in a new tab")}
          title={t("Open in a new tab")}
        >
          <Icon name="external" />
        </a>
      )}
      {switcher && (
        <IconButton
          icon="swap"
          label={switcher.label}
          title={switcher.title ?? switcher.label}
          disabled={switcher.disabled}
          onClick={switcher.onClick}
        />
      )}
      {widen && (
        <IconButton
          icon={widen.wide ? "collapse" : "expand"}
          label={widen.wide ? t("Restore viewer width") : t("Widen viewer")}
          disabled={widen.disabled}
          onClick={widen.onToggle}
        />
      )}
      {onClose && <IconButton icon="close" label={t("Close the material viewer")} onClick={onClose} />}
    </div>
  );
}

// The tooltip names what was read; `unit` is the lecture's source_type.
const READ_TOOLTIP = {
  page: (vars) => t("You have read {viewed} of {total} pages", vars),
  slide: (vars) => t("You have read {viewed} of {total} slides", vars),
  cell: (vars) => t("You have read {viewed} of {total} cells", vars),
  section: (vars) => t("You have read {viewed} of {total} sections", vars),
};

/* Only shown once the backend knows the lecture's pages (total > 0). */
export function ReadingLabel({ viewed, total, unit = "page" }) {
  useI18n(); // re-render in a new interface language
  if (!Number.isFinite(viewed) || !Number.isFinite(total) || total <= 0) return null;
  const shown = Math.min(viewed, total);
  const vars = { viewed: shown, total };
  return (
    <span className="viewer__progress" title={(READ_TOOLTIP[unit] ?? READ_TOOLTIP.section)(vars)} data-testid="reading-progress">
      <span className="viewer__progress-long">{t("Read {viewed} of {total}", vars)}</span>
      <span className="viewer__progress-short">
        {shown}/{total}
      </span>
    </span>
  );
}

export function ViewerBanner({ children }) {
  return (
    <p className="viewer__banner" role="status">
      <Icon name="chat" size={15} />
      {children}
    </p>
  );
}

export function ZoomControls({ zoom, label, canZoomOut, canZoomIn, onZoomOut, onZoomIn }) {
  const { t } = useI18n();
  return (
    <div className="viewer__zoom">
      <IconButton icon="zoomOut" label={t("Zoom out")} disabled={!canZoomOut} onClick={onZoomOut} />
      <span className="viewer__zoom-value" aria-live="polite">
        {label ?? `${zoom}%`}
      </span>
      <IconButton icon="zoomIn" label={t("Zoom in")} disabled={!canZoomIn} onClick={onZoomIn} />
    </div>
  );
}
