import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import ConfirmDialog from "../../../components/ui/ConfirmDialog.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import NotebookCell from "../../notebook/components/NotebookCell.jsx";
import NotebookToolbar from "../../notebook/components/NotebookToolbar.jsx";
import { createCell, fileNameForTitle, newCellId, serializeNotebook } from "../../../services/notebook/ipynb.js";
import "../../notebook/notebook.css";

/*
  Centre view (default): the Jupyter-style Python notebook.

  The notebook state, its run queue and the Python kernel live in WorkspaceLayout
  (passed in through the Outlet context), so cells, outputs and variables survive
  switching to the Exam view and back. Python runs for real, in a Web Worker
  (services/python/), and the notebook is saved in this browser only.
*/
export default function NotebookPage() {
  const { notebookState, kernel, kernelState } = useOutletContext();
  const { notebook, runState, saveInfo, notice, lastRunFailed, pendingOpen, actions } = notebookState;
  const { cells } = notebook;

  const [selectedId, setSelectedId] = useState(cells[0]?.id ?? null);
  const [editingIds, setEditingIds] = useState(() => new Set()); // Markdown cells showing their source
  const [focusRequest, setFocusRequest] = useState(null); // { id, target, seq }
  const [confirm, setConfirm] = useState(null); // { kind: "delete" | "restart" | "new", id? }
  const fileInputRef = useRef(null);

  // Python is downloaded when the notebook is first shown (later visits reuse it).
  useEffect(() => {
    kernel.start().catch(() => {}); // a failure is shown by the kernel status
  }, [kernel]);

  const focusCell = useCallback((id, target) => {
    setSelectedId(id);
    setFocusRequest((previous) => ({ id, target, seq: (previous?.seq ?? 0) + 1 }));
  }, []);

  const setEditing = useCallback((id, editing) => {
    setEditingIds((current) => {
      if (current.has(id) === editing) return current;
      const next = new Set(current);
      if (editing) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const insertCell = useCallback(
    (cellType, index) => {
      const cell = createCell(cellType);
      actions.dispatch({ type: "insert", cell, index });
      if (cellType === "markdown") setEditing(cell.id, true);
      focusCell(cell.id, "editor");
      return cell;
    },
    [actions, focusCell, setEditing]
  );

  const deleteCell = useCallback(
    (id) => {
      const list = actions.getCells();
      const index = list.findIndex((cell) => cell.id === id);
      actions.dispatch({ type: "delete", id });
      setEditing(id, false);
      const neighbour = list[index + 1] ?? list[index - 1];
      if (neighbour) focusCell(neighbour.id, "cell");
      else setSelectedId(null);
    },
    [actions, focusCell, setEditing]
  );

  /* Runs a code cell, or renders a Markdown cell. */
  const runCell = useCallback(
    (id) => {
      const cell = actions.getCells().find((item) => item.id === id);
      if (!cell) return;
      if (cell.cell_type === "code") actions.runCells([id]);
      else if (cell.cell_type === "markdown") {
        setEditing(id, false);
        focusCell(id, "cell");
      }
    },
    [actions, focusCell, setEditing]
  );

  const cellActions = useMemo(
    () => ({
      select: (id) => setSelectedId(id),
      change: (id, source) => actions.dispatch({ type: "edit", id, source }),
      run: runCell,
      runAndAdvance(id) {
        runCell(id);
        const list = actions.getCells();
        const index = list.findIndex((cell) => cell.id === id);
        const next = list[index + 1];
        if (!next) insertCell("code", index + 1);
        else focusCell(next.id, next.cell_type === "markdown" && !editingIds.has(next.id) ? "cell" : "editor");
      },
      edit(id) {
        setEditing(id, true);
        focusCell(id, "editor");
      },
      selectNeighbour(id, offset) {
        const list = actions.getCells();
        const next = list[list.findIndex((cell) => cell.id === id) + offset];
        if (next) focusCell(next.id, "cell");
      },
      insert(id, cellType, offset) {
        const index = actions.getCells().findIndex((cell) => cell.id === id);
        insertCell(cellType, index + offset);
      },
      move(id, offset) {
        actions.dispatch({ type: "move", id, offset });
        focusCell(id, "cell");
      },
      duplicate(id) {
        const list = actions.getCells();
        const index = list.findIndex((cell) => cell.id === id);
        const copy = { ...structuredClone(list[index]), id: newCellId() };
        actions.dispatch({ type: "insert", cell: copy, index: index + 1 });
        focusCell(copy.id, "cell");
      },
      convert(id, cellType) {
        actions.dispatch({ type: "convert", id, cellType });
        setEditing(id, cellType === "markdown");
        focusCell(id, "editor");
      },
      clearOutput: (id) => actions.dispatch({ type: "clearOutputs", id }),
      requestDelete(id) {
        const cell = actions.getCells().find((item) => item.id === id);
        if (!cell) return;
        const isEmpty = !cell.source.trim() && !(cell.outputs?.length > 0);
        if (isEmpty) deleteCell(id);
        else setConfirm({ kind: "delete", id });
      },
    }),
    [actions, runCell, insertCell, focusCell, setEditing, deleteCell, editingIds]
  );

  // Ctrl/Cmd + S saves the notebook instead of opening the browser's "Save page" dialog.
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        actions.save();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [actions]);

  function addCellAtEnd(cellType) {
    const selectedIndex = cells.findIndex((cell) => cell.id === selectedId);
    insertCell(cellType, selectedIndex >= 0 ? selectedIndex + 1 : cells.length);
  }

  function download() {
    if (cells.length === 0) return; // nothing to download; the button is disabled
    const text = serializeNotebook(notebook, { pythonVersion: kernelState.pythonVersion });
    const url = URL.createObjectURL(new Blob([text], { type: "application/x-ipynb+json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameForTitle(notebook.title);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function confirmAction() {
    const { kind, id } = confirm;
    setConfirm(null);
    if (kind === "delete") deleteCell(id);
    else if (kind === "restart") actions.restartKernel();
    else if (kind === "new") {
      actions.newNotebook();
      setSelectedId(null);
    }
  }

  const hasCodeCells = cells.some((cell) => cell.cell_type === "code");
  const hasOutputs = cells.some((cell) => cell.outputs?.length > 0);
  const kernelUnavailable = kernelState.status === "unavailable";

  return (
    <section className="panel center-panel notebook" aria-label="Notebook">
      <NotebookToolbar
        title={notebook.title}
        saveInfo={saveInfo}
        kernelState={kernelState}
        lastRunFailed={lastRunFailed}
        hasCells={cells.length > 0}
        hasCodeCells={hasCodeCells}
        hasOutputs={hasOutputs}
        onRename={(title) => actions.dispatch({ type: "rename", title })}
        onAddCode={() => addCellAtEnd("code")}
        onAddMarkdown={() => addCellAtEnd("markdown")}
        onRunAll={actions.runAll}
        onInterrupt={actions.interrupt}
        onRestart={() => setConfirm({ kind: "restart" })}
        onClearOutputs={() => actions.dispatch({ type: "clearAllOutputs" })}
        onNew={() => (cells.length > 0 ? setConfirm({ kind: "new" }) : actions.newNotebook())}
        onImport={() => fileInputRef.current?.click()}
        onDownload={download}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".ipynb,application/x-ipynb+json,application/json"
        hidden
        aria-label="Import notebook file"
        onChange={(event) => {
          const [file] = event.target.files;
          event.target.value = ""; // allows picking the same file again
          if (file) actions.openFile(file);
        }}
      />

      <div className="notebook__body">
        {kernelUnavailable && (
          <div className="notebook__notice notebook__notice--error" role="alert">
            <span>{kernelState.error}</span>
            <Button size="sm" onClick={() => kernel.start().catch(() => {})}>
              Retry
            </Button>
          </div>
        )}
        {notice && (
          <div className={`notebook__notice notebook__notice--${notice.kind}`} role="alert">
            <span>{notice.text}</span>
            <IconButton icon="close" label="Dismiss" onClick={actions.dismissNotice} />
          </div>
        )}

        {cells.length === 0 ? (
          <div className="notebook__empty">
            <span className="notebook__empty-icon">
              <Icon name="code" />
            </span>
            <p className="notebook__empty-title">This notebook is empty</p>
            <p className="notebook__empty-text">
              Write Python and run it right here — code runs in your browser. Add Markdown cells for your notes.
            </p>
            <div className="notebook__empty-actions">
              <Button variant="primary" icon="plus" onClick={() => insertCell("code", 0)}>
                Create your first code cell
              </Button>
              <Button icon="text" onClick={() => insertCell("markdown", 0)}>
                Add a Markdown cell
              </Button>
              <Button variant="ghost" icon="upload" onClick={() => fileInputRef.current?.click()}>
                Import .ipynb
              </Button>
            </div>
          </div>
        ) : (
          <>
            {cells.map((cell, index) => (
              <NotebookCell
                key={cell.id}
                cell={cell}
                index={index}
                cellCount={cells.length}
                runStatus={runState[cell.id]}
                selected={cell.id === selectedId}
                editing={editingIds.has(cell.id)}
                focusRequest={focusRequest?.id === cell.id ? focusRequest : null}
                actions={cellActions}
              />
            ))}
            <div className="notebook__add">
              <Button variant="ghost" size="sm" icon="plus" onClick={() => insertCell("code", cells.length)}>
                Code
              </Button>
              <Button variant="ghost" size="sm" icon="text" onClick={() => insertCell("markdown", cells.length)}>
                Markdown
              </Button>
            </div>
            <p className="notebook__hint">
              Shift + Enter runs a cell and moves on · Ctrl/⌘ + Enter runs it in place · Esc leaves the editor · Ctrl/⌘ + S saves
            </p>
          </>
        )}
      </div>

      {confirm?.kind === "delete" && (
        <ConfirmDialog title="Delete this cell?" confirmLabel="Delete" danger onConfirm={confirmAction} onCancel={() => setConfirm(null)}>
          <p>The cell and its output will be removed. This can’t be undone.</p>
        </ConfirmDialog>
      )}
      {confirm?.kind === "restart" && (
        <ConfirmDialog title="Restart the Python kernel?" confirmLabel="Restart" onConfirm={confirmAction} onCancel={() => setConfirm(null)}>
          <p>All variables, functions and imports will be cleared, and any running cell is stopped.</p>
          <p>Your cells and their outputs stay as they are.</p>
        </ConfirmDialog>
      )}
      {confirm?.kind === "new" && (
        <ConfirmDialog title="Start a new notebook?" confirmLabel="New notebook" danger onConfirm={confirmAction} onCancel={() => setConfirm(null)}>
          <p>This replaces the current notebook saved in this browser, and restarts Python.</p>
          <p>Download it first if you want to keep a copy.</p>
          <div>
            <Button size="sm" icon="download" onClick={download}>
              Download current notebook
            </Button>
          </div>
        </ConfirmDialog>
      )}
      {pendingOpen && (
        <ConfirmDialog
          title={`Open “${pendingOpen.title}”?`}
          confirmLabel="Open notebook"
          danger
          onConfirm={actions.confirmOpen}
          onCancel={actions.cancelOpen}
        >
          <p>This replaces the current notebook saved in this browser, and restarts Python.</p>
          <p>Download it first if you want to keep a copy.</p>
          <div>
            <Button size="sm" icon="download" onClick={download}>
              Download current notebook
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
