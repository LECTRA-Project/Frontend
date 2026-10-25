/*
  One notebook cell (Jupyter style). type is "markdown" or "code".
  Code cells show the "[ ]:" prompt on the left like Jupyter does before a cell has run.
*/
export default function NotebookCell({ cell, isActive, onFocus, onChange }) {
  const isCode = cell.type === "code";
  const label = isCode ? "Code" : "Markdown";
  const lineCount = Math.max(1, cell.value.split("\n").length);

  return (
    <div className="nb-cell-row">
      <span className="nb-cell__prompt" aria-hidden="true">
        {isCode ? "[ ]:" : ""}
      </span>
      <div className={`nb-cell ${isActive ? "nb-cell--active" : ""}`}>
        <label className="nb-cell__label" htmlFor={`cell-${cell.id}`}>
          {label}
        </label>
        <textarea
          id={`cell-${cell.id}`}
          className={`nb-cell__input ${isCode ? "nb-cell__input--code" : ""}`}
          rows={lineCount}
          spellCheck={!isCode}
          placeholder={isCode ? "Enter code…" : "Write a note…"}
          value={cell.value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  );
}
