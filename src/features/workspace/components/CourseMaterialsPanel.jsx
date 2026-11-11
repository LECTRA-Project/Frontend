import { useState } from "react";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { formatFileSize, groupOf, MATERIAL_GROUPS } from "../../../services/materials/materialTypes.js";

/*
  Left panel: the student's uploaded course materials, grouped by file type, with a
  filter box. Only real uploads are listed; with none, an empty state invites an upload.

  Props:
    materials         uploaded files: { id, type, name, size, url, persisted } (see useCourseMaterials)
    status            "loading" while saved materials are read, then "ready"
    persistent        false if files can only be kept for this tab
    error             message to show, or null
    selectedId        id of the highlighted item
    collapsed         whether the materials list is hidden
    onToggleCollapsed toggles the materials list
    onSelect          called with the material when an item is clicked
    onRemove          called with the material when its remove button is clicked
    onUploadClick     called when "Upload materials" is clicked
    onDismissError    hides the error
*/
export default function CourseMaterialsPanel({
  materials,
  status,
  persistent,
  error,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onRemove,
  onUploadClick,
  onDismissError,
}) {
  const [filter, setFilter] = useState("");

  const query = filter.trim().toLowerCase();
  const visibleMaterials = materials.filter((item) => item.name.toLowerCase().includes(query));

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
        {error && (
          <div className="materials__error" role="alert">
            <span>{error}</span>
            <IconButton icon="close" label="Dismiss" onClick={onDismissError} />
          </div>
        )}

        {status === "loading" && (
          <p className="materials__empty" role="status">
            Loading your materials…
          </p>
        )}

        {status === "ready" && materials.length === 0 && (
          <div className="materials__empty-state">
            <span className="materials__empty-icon">
              <Icon name="uploadCloud" />
            </span>
            <p className="materials__empty-title">No course materials yet</p>
            <p className="materials__empty-text">Upload your lecture notes, PDFs, slides, or notebooks to get started.</p>
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
                        <span className="material-row__meta">
                          {groupOf(item.type).short} · {formatFileSize(item.size)}
                          {!item.persisted && " · this tab only"}
                        </span>
                      </span>
                    </button>
                    <span className="material-item__actions">
                      <a className="icon-btn" href={item.url} download={item.name} aria-label={`Download ${item.name}`} title="Download">
                        <Icon name="download" size={16} />
                      </a>
                      <IconButton icon="trash" label={`Remove ${item.name}`} onClick={() => onRemove(item)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {materials.length > 0 && visibleMaterials.length === 0 && (
          <p className="materials__empty">No materials match “{filter}”.</p>
        )}
      </div>

      <div className="materials__bottom" hidden={collapsed}>
        {materials.length > 0 && (
          <p className="materials__storage-note">
            {persistent
              ? "Saved in this browser only — not uploaded to the LECTRA server."
              : "This browser can’t save files, so they are kept until you close this tab."}
          </p>
        )}
        <Button icon="upload" fullWidth onClick={onUploadClick}>
          Upload materials
        </Button>
      </div>
    </section>
  );
}
