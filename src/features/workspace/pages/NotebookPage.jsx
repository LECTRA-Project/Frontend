import { useState } from "react";
import { useOutletContext } from "react-router-dom";

import NotebookToolbar from "../components/NotebookToolbar.jsx";
import NotebookCell from "../components/NotebookCell.jsx";

/*
  Centre view (default): a simple Jupyter-style notebook.
  The cells live in WorkspaceLayout (passed in through the Outlet context), so text you
  type is kept when you switch to the Exam view and back.
  Running code is NOT implemented in this phase — "Run" only shows a notice.
*/
export default function NotebookPage() {
  const { cells, setCells } = useOutletContext();
  const [activeId, setActiveId] = useState(cells[0]?.id);
  const [notice, setNotice] = useState("");

  function updateCell(id, value) {
    setCells((list) => list.map((cell) => (cell.id === id ? { ...cell, value } : cell)));
  }

  function addCell() {
    const newCell = { id: crypto.randomUUID(), type: "code", value: "" };
    setCells((list) => [...list, newCell]);
    setActiveId(newCell.id);
    setNotice("");
  }

  function runCell() {
    setNotice("Running cells isn’t available yet — code execution is planned for a later phase.");
  }

  return (
    <section className="panel center-panel" aria-label="Notebook">
      <NotebookToolbar fileName="Study notebook.ipynb" onRun={runCell} onAddCell={addCell} />

      <div className="notebook__body">
        {notice && (
          <p className="notebook__notice" role="status">
            {notice}
          </p>
        )}
        {cells.map((cell) => (
          <NotebookCell
            key={cell.id}
            cell={cell}
            isActive={cell.id === activeId}
            onFocus={() => setActiveId(cell.id)}
            onChange={(value) => updateCell(cell.id, value)}
          />
        ))}
      </div>
    </section>
  );
}
