import { useState } from "react";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { MATERIAL_GROUPS } from "../../../services/materials/materialTypes.js";
import { STATUS_LABEL } from "../../lectures/materialTypes.js";

/*
  Left panel: the student's lecture materials from the backend, grouped by type,
  with a filter box, processing status and per-item actions.

  Props:
    materials         array of { id, type, name, meta, status, error } (see toMaterial)
    uploads           files being uploaded right now: { id, name, progress, error }
    loading / error   state of the initial load
    selectedId        id of the highlighted item
    collapsed         whether the materials list is hidden
    onToggleCollapsed toggles the materials list
    onSelect          called with the material when an item is clicked
    onEdit / onDelete / onRetry   called with the material
    onDismissUpload   removes a failed upload from the list
    onReload          retries loading after an error
    onUploadClick     called when "Upload materials" is clicked
*/
export default function CourseMaterialsPanel({
  materials,
  uploads = [],
  loading = false,
  error = null,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onEdit,
  onDelete,
  onRetry,
  onDismissUpload,
  onReload,
  onUploadClick,
}) {
  const [filter, setFilter] = useState("");

  const query = filter.trim().toLowerCase();
  const visibleMaterials = materials.filter(
    (item) => item.name.toLowerCase().includes(query) || (item.lecture?.course ?? "").toLowerCase().includes(query)
  );

  return (
    <section
      className={`panel materials ${collapsed ? "materials--collapsed" : ""}`}
      aria-label="Course materials"
    >
      <div className="materials__top">
        {!collapsed && <h2 className="panel__title">Course materials</h2>}
        <IconButton
          icon={collapsed ? "menu" : "chevronLeft"}
          label={collapsed ? "Show course materials" : "Hide course materials"}
          aria-expanded={!collapsed}
          aria-controls="course-material-list"
          onClick={onToggleCollapsed}
        />

        <label className="materials__filter" hidden={collapsed || materials.length === 0}>
          <span className="visually-hidden">Filter materials</span>
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Filter materials"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </div>

      <div className="materials__list" id="course-material-list" hidden={collapsed}>
        {uploads.length > 0 && (
          <div className="materials__group">
            <h3 className="materials__group-title">Uploading</h3>
            <ul>
              {uploads.map((upload) => (
                <li key={upload.id} className="material-upload">
                  <Icon name={upload.error ? "alert" : "upload"} />
                  <span className="material-row__text">
                    <span className="material-row__name">{upload.name}</span>
                    {upload.error ? (
                      <span className="material-row__error" role="alert">
                        {upload.error}
                      </span>
                    ) : (
                      <span className="material-progress" aria-label={`Uploading ${upload.name}: ${upload.progress}%`}>
                        <span className="material-progress__bar" style={{ width: `${upload.progress}%` }} />
                      </span>
                    )}
                  </span>
                  {upload.error && (
                    <IconButton icon="close" label={`Dismiss ${upload.name}`} onClick={() => onDismissUpload(upload.id)} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && <p className="materials__empty">Loading your materials…</p>}

        {!loading && error && (
          <div className="materials__empty" role="alert">
            <p>{error.message || "Your materials could not be loaded."}</p>
            <Button size="sm" icon="refresh" onClick={onReload}>
              Try again
            </Button>
          </div>
        )}

        {!loading && !error && materials.length === 0 && uploads.length === 0 && (
          <div className="materials__empty-state">
            <span className="materials__empty-icon">
              <Icon name="uploadCloud" />
            </span>
            <p className="materials__empty-title">No course materials yet</p>
            <p className="materials__empty-text">
              Upload your lecture notes, PDFs, slides or notebooks to get started. The study assistant answers from them.
            </p>
          </div>
        )}

        {MATERIAL_GROUPS.map((group) => {
          const items = visibleMaterials.filter((item) => item.type === group.type);
          if (items.length === 0) return null;

          return (
            <div key={group.type} className="materials__group">
              <h3 className="materials__group-title">{group.label}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item.id} className="material-item">
                    <button
                      type="button"
                      className={`material-row ${item.id === selectedId ? "material-row--selected" : ""}`}
                      aria-current={item.id === selectedId ? "true" : undefined}
                      onClick={() => onSelect(item)}
                    >
                      <Icon name={group.icon} />
                      <span className="material-row__text">
                        <span className="material-row__name">{item.name}</span>
                        <span className="material-row__meta">{item.meta}</span>
                        {item.status && item.status !== "completed" && (
                          <span className={`status-badge status-badge--${item.status}`} title={item.error || undefined}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>
                        )}
                        {item.status === "failed" && item.error && (
                          <span className="material-row__error" title={item.error}>
                            {item.error}
                          </span>
                        )}
                      </span>
                    </button>
                    <span className="material-item__actions">
                      {item.status === "failed" && onRetry && (
                        <IconButton icon="refresh" label={`Retry processing ${item.name}`} onClick={() => onRetry(item)} />
                      )}
                      {onEdit && <IconButton icon="edit" label={`Edit ${item.name}`} onClick={() => onEdit(item)} />}
                      {onDelete && <IconButton icon="trash" label={`Delete ${item.name}`} onClick={() => onDelete(item)} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {query && materials.length > 0 && visibleMaterials.length === 0 && (
          <p className="materials__empty">No materials match “{filter}”.</p>
        )}
      </div>

      <div className="materials__bottom" hidden={collapsed}>
        <Button icon="upload" fullWidth onClick={onUploadClick}>
          Upload materials
        </Button>
      </div>
    </section>
  );
}
