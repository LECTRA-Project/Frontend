import { useState } from "react";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import Menu from "../../../components/ui/Menu.jsx";
import KernelStatus from "./KernelStatus.jsx";

const STORAGE_NOTE =
  "Saved automatically in this browser only (local storage), not on the LECTRA server. Use Download .ipynb to keep a copy.";

function SaveState({ saveInfo }) {
  if (saveInfo.error) {
    return (
      <span className="notebook-toolbar__save notebook-toolbar__save--error" title={saveInfo.error} role="alert">
        Not saved: {saveInfo.error}
      </span>
    );
  }
  let text = "Not saved yet";
  if (saveInfo.isDirty) text = "Unsaved changes";
  else if (saveInfo.savedAt) {
    const time = new Date(saveInfo.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    text = `Saved in this browser · ${time}`;
  }
  return (
    <span className="notebook-toolbar__save" title={STORAGE_NOTE}>
      {text}
    </span>
  );
}

/*
  The notebook toolbar: title, save state, kernel status and the panel's own actions
  (`actions`: pin, widen, close) on the first row; cell, run, kernel and file actions on
  the second.
*/
export default function NotebookToolbar({
  title,
  saveInfo,
  kernelState,
  lastRunFailed,
  hasCells,
  hasCodeCells,
  hasOutputs,
  onRename,
  onAddCode,
  onAddMarkdown,
  onRunAll,
  onInterrupt,
  onRestart,
  onClearOutputs,
  onNew,
  onImport,
  onDownload,
  actions = null,
}) {
  // The title is edited locally and committed on every change; an empty title is replaced on blur.
  const [draftTitle, setDraftTitle] = useState(null);
  const shownTitle = draftTitle ?? title;
  const busy = kernelState.status === "busy";
  const stopLabel = kernelState.canSoftInterrupt
    ? "Stop the running cell"
    : "Stop the running cell (Python restarts, so variables are cleared)";

  return (
    <div className="notebook-toolbar">
      <div className="notebook-toolbar__row">
        <div className="notebook-toolbar__file">
          <Icon name="notebook" />
          <input
            className="notebook-toolbar__title"
            aria-label="Notebook title"
            value={shownTitle}
            onChange={(event) => {
              setDraftTitle(event.target.value);
              if (event.target.value.trim()) onRename(event.target.value);
            }}
            onBlur={() => {
              if (!shownTitle.trim()) onRename("Untitled notebook");
              setDraftTitle(null);
            }}
          />
          <SaveState saveInfo={saveInfo} />
        </div>
        <KernelStatus kernelState={kernelState} lastRunFailed={lastRunFailed} />
        {actions && <div className="notebook-toolbar__panel-actions">{actions}</div>}
      </div>

      <div className="notebook-toolbar__row notebook-toolbar__actions" role="toolbar" aria-label="Notebook actions">
        <div className="notebook-toolbar__group">
          <Button variant="ghost" size="sm" icon="plus" onClick={onAddCode} title="Add a code cell">
            <span className="notebook-toolbar__label">Code</span>
          </Button>
          <Button variant="ghost" size="sm" icon="text" onClick={onAddMarkdown} title="Add a Markdown cell">
            <span className="notebook-toolbar__label">Markdown</span>
          </Button>
        </div>
        <div className="notebook-toolbar__group">
          <Button variant="ghost" size="sm" icon="play" onClick={onRunAll} disabled={!hasCodeCells} title="Run all cells in order">
            <span className="notebook-toolbar__label">Run all</span>
          </Button>
          <Button variant="ghost" size="sm" icon="stop" onClick={onInterrupt} disabled={!busy} title={stopLabel}>
            <span className="notebook-toolbar__label">Stop</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="restart"
            onClick={onRestart}
            disabled={kernelState.status === "starting"}
            title="Restart the Python kernel (clears all variables)"
          >
            <span className="notebook-toolbar__label">Restart</span>
          </Button>
          <Button variant="ghost" size="sm" icon="eraser" onClick={onClearOutputs} disabled={!hasOutputs} title="Clear all outputs">
            <span className="notebook-toolbar__label">Clear outputs</span>
          </Button>
        </div>
        <div className="notebook-toolbar__group notebook-toolbar__group--end">
          <Button
            variant="ghost"
            size="sm"
            icon="download"
            onClick={onDownload}
            disabled={!hasCells}
            title={hasCells ? "Download this notebook as a Jupyter .ipynb file" : "The notebook is empty — add a cell to download it"}
          >
            <span className="notebook-toolbar__label">Download .ipynb</span>
          </Button>
          <Menu
            label="File"
            icon="folder"
            text="File"
            items={[
              { label: "New notebook", icon: "plus", onSelect: onNew },
              { label: "Import .ipynb…", icon: "upload", onSelect: onImport },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
