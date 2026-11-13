import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";

/*
  The parts every material viewer shares (PDF, notes, slides and notebooks):

  ViewerHead     icon, title and meta; then the actions (open in a new tab, download, …),
                 the optional Widen / Restore button (`widen`: { wide, disabled, onToggle },
                 like the notebook's), the optional Switch places button (`switcher`:
                 { label, disabled, title, onClick }) and the close button.
  ViewerBanner   "Opened from a source in the answer: page 12", shown while the viewer is
                 on the place an answer cited.
  ZoomControls   − 100% +  (`label` replaces the percentage, e.g. "Fit")
*/
export function ViewerHead({ icon = "fileText", title, meta, newTabUrl = null, children = null, widen = null, switcher = null, onClose }) {
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
      {children}
      {newTabUrl && (
        <a
          className="icon-btn"
          href={newTabUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in a new tab"
          title="Open in a new tab"
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
          label={widen.wide ? "Restore viewer width" : "Widen viewer"}
          disabled={widen.disabled}
          onClick={widen.onToggle}
        />
      )}
      {onClose && <IconButton icon="close" label="Close the material viewer" onClick={onClose} />}
    </div>
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
  return (
    <div className="viewer__zoom">
      <IconButton icon="zoomOut" label="Zoom out" disabled={!canZoomOut} onClick={onZoomOut} />
      <span className="viewer__zoom-value" aria-live="polite">
        {label ?? `${zoom}%`}
      </span>
      <IconButton icon="zoomIn" label="Zoom in" disabled={!canZoomIn} onClick={onZoomIn} />
    </div>
  );
}
