import { useState } from "react";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import { MATERIAL_GROUPS } from "../../../data/sampleMaterials.js";

/*
  Left panel: the list of course materials, grouped by type, with a filter box.

  Props:
    materials      array of { id, type, name, meta } (demo items + files added this session)
    selectedId     id of the highlighted item
    collapsed      whether the materials list is hidden
    onToggleCollapsed toggles the materials list
    onSelect       called with the material when an item is clicked
    onUploadClick  called when "Upload materials" is clicked
*/
export default function CourseMaterialsPanel({
  materials,
  selectedId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onUploadClick,
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

        <label className="materials__filter" hidden={collapsed}>
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
        {MATERIAL_GROUPS.map((group) => {
          const items = visibleMaterials.filter((item) => item.type === group.type);
          if (items.length === 0) return null;

          return (
            <div key={group.type} className="materials__group">
              <h3 className="materials__group-title">{group.label}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
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
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {visibleMaterials.length === 0 && <p className="materials__empty">No materials match “{filter}”.</p>}
      </div>

      <div className="materials__bottom" hidden={collapsed}>
        <Button icon="upload" fullWidth onClick={onUploadClick}>
          Upload materials
        </Button>
      </div>
    </section>
  );
}
