import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "katex/dist/katex.min.css";

import { cellContextLabel, isOverCellDropZone } from "../../../services/notebook/cellContext.js";
import { useI18n } from "../../../i18n/i18n.js";
import Icon from "../../../components/ui/Icon.jsx";
import IconButton from "../../../components/ui/IconButton.jsx";
import Menu from "../../../components/ui/Menu.jsx";
import { renderMarkdown } from "../../../services/notebook/markdown.js";
import CellOutput from "./CellOutput.jsx";
import CodeEditor from "./CodeEditor.jsx";


function promptText(cell, runStatus) {
  if (cell.cell_type !== "code") return "";
  if (runStatus) return "In [*]:";
  return `In [${cell.execution_count ?? " "}]:`;
}

/*
  One notebook cell, Jupyter style.

  Two modes, as in Jupyter:
    edit mode     the editor has focus — type code; Shift+Enter runs and moves on, Escape leaves
    command mode  the cell box has focus — Enter edits, ↑/↓ move between cells,
                  Shift+Enter runs, Delete deletes

  Markdown cells show their rendered text until edited (double-click or Enter).

  The grip in the header drags the cell into the Study Assistant as context: native drag
  and drop with a mouse, a pointer-tracked drag on touch/pen, and Enter or Space on the
  focused grip for the keyboard. Only the grip is draggable, so selecting text, editing
  and the cell's buttons work as usual. Dragging never runs or changes the cell.

  Props:
    cell, index, cellCount
    runStatus       "queued" | "running" | undefined
    progress        while running: what the kernel is doing (e.g. "Installing seaborn…"), or ""
    selected        whether this is the selected cell
    editing         Markdown cells: whether the source editor is shown
    focusRequest    { target: "editor" | "cell" } when the notebook wants this cell focused
    actions         notebook-level cell actions, all taking the cell id first
*/
function NotebookCell({ cell, index, cellCount, runStatus, progress, selected, editing, focusRequest, actions }) {
  const boxRef = useRef(null);
  const editorRef = useRef(null);

  const { t } = useI18n();
  const { id } = cell;
  const number = index + 1;
  const typeLabel = { code: "Python", markdown: "Markdown", raw: t("Raw") }[cell.cell_type];
  const isCode = cell.cell_type === "code";
  const isMarkdown = cell.cell_type === "markdown";
  const showEditor = !isMarkdown || editing;
  const busy = Boolean(runStatus);
  const hasOutputs = isCode && cell.outputs.length > 0;
  const cellName = cellContextLabel({ cellType: cell.cell_type, position: number });

  // Focus on the next frame, once a newly shown editor exists (it may be re-created right after mounting).
  useEffect(() => {
    if (!focusRequest) return undefined;
    const frame = requestAnimationFrame(() => {
      if (focusRequest.target === "editor" && editorRef.current) editorRef.current.focus();
      else boxRef.current?.focus();
      boxRef.current?.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  /*
    Touch and pen drag. Mobile browsers don't reliably support native drag and drop,
    so the grip follows the pointer itself: past a small threshold it becomes a drag,
    and lifting over the Study Assistant adds the cell. Mouse drags use native DnD.
  */
  const touchDrag = useRef(null); // { pointerId, x, y, dragging }
  const [touchGhost, setTouchGhost] = useState(null); // { x, y } while dragging

  function handleGripPointerDown(event) {
    if (event.pointerType === "mouse") return;
    touchDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleGripPointerMove(event) {
    const drag = touchDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.dragging = true;
      actions.startPointerDrag();
    }
    event.preventDefault();
    setTouchGhost({ x: event.clientX, y: event.clientY });
    actions.pointerDragOver(isOverCellDropZone(event.clientX, event.clientY));
  }

  function finishTouchDrag(event, drop) {
    const drag = touchDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    touchDrag.current = null;
    setTouchGhost(null);
    if (!drag.dragging) return;
    if (drop && isOverCellDropZone(event.clientX, event.clientY)) actions.addToAssistant(id);
    actions.endDrag();
  }

  function handleCommandKeys(event) {
    if (event.target !== boxRef.current) return; // keys typed in the editor or on buttons
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      actions.runAndAdvance(id);
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      actions.run(id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      actions.edit(id);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      actions.selectNeighbour(id, event.key === "ArrowUp" ? -1 : 1);
    } else if (event.key === "Delete") {
      event.preventDefault();
      actions.requestDelete(id);
    }
  }

  const menuItems = [
    isCode
      ? { label: t("Run cell"), icon: "play", onSelect: () => actions.run(id), disabled: busy }
      : isMarkdown
        ? { label: editing ? t("Render Markdown") : t("Edit Markdown"), icon: "text", onSelect: () => (editing ? actions.run(id) : actions.edit(id)) }
        : null,
    { label: t("Insert code cell above"), icon: "plus", onSelect: () => actions.insert(id, "code", 0) },
    { label: t("Insert code cell below"), icon: "plus", onSelect: () => actions.insert(id, "code", 1) },
    { label: t("Insert Markdown cell below"), icon: "plus", onSelect: () => actions.insert(id, "markdown", 1) },
    "separator",
    { label: t("Duplicate cell"), icon: "copy", onSelect: () => actions.duplicate(id) },
    isCode
      ? { label: t("Convert to Markdown"), icon: "text", onSelect: () => actions.convert(id, "markdown"), disabled: busy }
      : { label: t("Convert to code"), icon: "code", onSelect: () => actions.convert(id, "code") },
    isCode ? { label: t("Clear output"), icon: "eraser", onSelect: () => actions.clearOutput(id), disabled: !hasOutputs || busy } : null,
    "separator",
    { label: t("Delete cell"), icon: "trash", onSelect: () => actions.requestDelete(id), danger: true },
  ].filter(Boolean);

  return (
    <div className={`nb-cell-row ${selected ? "nb-cell-row--selected" : ""}`}>
      <div className="nb-cell-row__main">
        <span className={`nb-cell__prompt ${busy ? "nb-cell__prompt--busy" : ""}`} aria-hidden="true">
          {promptText(cell, runStatus)}
        </span>

        <div
          ref={boxRef}
          className={`nb-cell nb-cell--${cell.cell_type} ${selected ? "nb-cell--selected" : ""} ${runStatus === "running" ? "nb-cell--running" : ""}`}
          tabIndex={0}
          role="group"
          aria-label={cellName}
          onFocus={() => actions.select(id)}
          onKeyDown={handleCommandKeys}
        >
          <div className="nb-cell__header">
            <button
              type="button"
              className="nb-cell__drag"
              draggable="true"
              aria-label={t("Drag {cell} to the Study Assistant", { cell: cellName })}
              aria-describedby={`${id}-drag-hint`}
              title={t("Drag into the Study Assistant to ask about this cell")}
              onDragStart={(event) => {
                if (boxRef.current) event.dataTransfer.setDragImage(boxRef.current, 16, 16);
                actions.startDrag(id, event.dataTransfer);
              }}
              onDragEnd={() => actions.endDrag()}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                actions.addToAssistant(id, { focusComposer: true });
              }}
              onPointerDown={handleGripPointerDown}
              onPointerMove={handleGripPointerMove}
              onPointerUp={(event) => finishTouchDrag(event, true)}
              onPointerCancel={(event) => finishTouchDrag(event, false)}
            >
              <Icon name="grip" size={14} />
            </button>
            <span id={`${id}-drag-hint`} hidden>
              {t("Press Enter to add this cell to your Study Assistant message.")}
            </span>
            {touchGhost &&
              createPortal(
                <div className="nb-cell__drag-ghost" style={{ left: touchGhost.x, top: touchGhost.y }} aria-hidden="true">
                  <Icon name="grip" size={12} />
                  {cellName}
                </div>,
                document.body
              )}
            <span className="nb-cell__type">{typeLabel}</span>
            {runStatus && (
              <span className="nb-cell__status" role="status">
                {runStatus === "running" ? <span className="spinner" aria-hidden="true" /> : null}
                {runStatus === "running" ? progress || t("Running…") : t("Queued")}
              </span>
            )}
            <div className="nb-cell__actions">
              {isCode && (
                <IconButton icon="play" label={t("Run cell {number}", { number })} disabled={busy} onClick={() => actions.run(id)} />
              )}
              {isMarkdown && editing && (
                <IconButton icon="check" label={t("Render cell {number}", { number })} onClick={() => actions.run(id)} />
              )}
              <IconButton icon="arrowUp" label={t("Move cell {number} up", { number })} disabled={index === 0} onClick={() => actions.move(id, -1)} />
              <IconButton
                icon="arrowDown"
                label={t("Move cell {number} down", { number })}
                disabled={index === cellCount - 1}
                onClick={() => actions.move(id, 1)}
              />
              <IconButton icon="trash" label={t("Delete cell {number}", { number })} onClick={() => actions.requestDelete(id)} />
              <Menu label={t("More actions for cell {number}", { number })} items={menuItems} />
            </div>
          </div>

          {showEditor ? (
            <CodeEditor
              value={cell.source}
              language={isCode ? "python" : isMarkdown ? "markdown" : "text"}
              ariaLabel={t("{type} editor, cell {number}", { type: typeLabel, number })}
              placeholderText={isCode ? t("Write Python code…") : isMarkdown ? t("Write notes in Markdown…") : t("Raw text…")}
              viewRef={editorRef}
              onChange={(source) => actions.change(id, source)}
              onFocus={() => actions.select(id)}
              onRun={() => actions.run(id)}
              onRunAndAdvance={() => actions.runAndAdvance(id)}
              onEscape={() => boxRef.current?.focus()}
            />
          ) : (
            <div
              className="markdown-body nb-cell__rendered"
              onDoubleClick={() => actions.edit(id)}
              title={t("Double-click to edit")}
            >
              {cell.source.trim() ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) }} />
              ) : (
                <p className="nb-cell__empty-markdown">{t("Empty Markdown cell — double-click or press Enter to write notes.")}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isCode && <CellOutput outputs={cell.outputs} running={runStatus === "running"} />}
    </div>
  );
}

export default memo(NotebookCell);
