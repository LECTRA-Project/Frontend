import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createNotebook, NotebookFormatError, parseIpynb, titleFromFileName } from "../../services/notebook/ipynb.js";
import { loadNotebook, saveNotebook } from "../../services/notebook/notebookStorage.js";
import { initialNotebookState, notebookReducer } from "./notebookReducer.js";

// Changes are saved to the browser this long after the last edit.
const AUTOSAVE_DELAY_MS = 1000;

/*
  A tiny store around notebookReducer. The run queue reads it synchronously, so a cell
  always runs the code that is in the editor at that moment, even before React re-renders.
*/
function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    getState: () => state,
    dispatch(action) {
      state = notebookReducer(state, action);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function restoreNotebook(userKey) {
  try {
    const saved = loadNotebook(userKey);
    if (saved) return { notebook: saved.notebook, savedAt: saved.savedAt, loadError: null };
  } catch (error) {
    return {
      notebook: createNotebook(),
      savedAt: null,
      loadError: `The notebook saved in this browser could not be restored (${error.message}). Your next change will replace it.`,
    };
  }
  return { notebook: createNotebook(), savedAt: null, loadError: null };
}

/* Reads a picked .ipynb file. Resolves the notebook or rejects with a readable message. */
async function readNotebookFile(file) {
  let text;
  try {
    text = await file.text();
  } catch (error) {
    throw new Error(`“${file.name}” could not be read (${error.message}).`, { cause: error });
  }
  try {
    return parseIpynb(text, { title: titleFromFileName(file.name) });
  } catch (error) {
    const reason = error instanceof NotebookFormatError ? error.message : String(error);
    throw new Error(`“${file.name}” could not be opened: ${reason}`, { cause: error });
  }
}

/*
  Owns the open notebook: its cells, the run queue, browser saving and file opening.
  Used by WorkspaceLayout so the notebook (and its run queue) survive switching to the
  Exam view and back.

  kernel   a PythonKernel (services/python/pythonKernel.js)
  userKey  identifies the signed-in user, so each user has their own saved notebook
*/
export function useNotebook(kernel, userKey) {
  const [initial] = useState(() => restoreNotebook(userKey));
  const [store] = useState(() => createStore(initialNotebookState(initial.notebook)));
  const state = useSyncExternalStore(store.subscribe, store.getState);

  const [saveInfo, setSaveInfo] = useState({ savedAt: initial.savedAt, error: null, savedChangeId: 0 });
  const [notice, setNotice] = useState(initial.loadError ? { kind: "error", text: initial.loadError } : null);
  const [lastRunFailed, setLastRunFailed] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(null); // notebook from a file, waiting for confirmation

  const queueRef = useRef([]); // ids of cells waiting to run, in order
  const processingRef = useRef(false);
  const savedChangeIdRef = useRef(0);

  const dispatch = store.dispatch;

  /* ---------- Saving (browser storage only) ---------- */

  const save = useCallback(() => {
    const { notebook, changeId } = store.getState();
    try {
      const savedAt = saveNotebook(userKey, notebook);
      savedChangeIdRef.current = changeId;
      setSaveInfo({ savedAt, error: null, savedChangeId: changeId });
      return true;
    } catch (error) {
      setSaveInfo((info) => ({ ...info, error: error.message }));
      return false;
    }
  }, [store, userKey]);

  const isDirty = state.changeId !== saveInfo.savedChangeId;

  useEffect(() => {
    if (!isDirty) return undefined;
    const timer = setTimeout(save, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDirty, state.changeId, save]);

  // Don't lose the last second of typing when the page closes or the workspace is left.
  useEffect(() => {
    const saveIfDirty = () => {
      if (store.getState().changeId !== savedChangeIdRef.current) save();
    };
    window.addEventListener("beforeunload", saveIfDirty);
    return () => {
      window.removeEventListener("beforeunload", saveIfDirty);
      saveIfDirty();
    };
  }, [store, save]);

  /* ---------- Running cells ---------- */

  const abortQueue = useCallback(() => {
    const waiting = queueRef.current;
    queueRef.current = [];
    if (waiting.length > 0) dispatch({ type: "unqueue", ids: waiting });
  }, [dispatch]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const id = queueRef.current.shift();
        const cell = store.getState().notebook.cells.find((item) => item.id === id);
        if (!cell || cell.cell_type !== "code") {
          dispatch({ type: "unqueue", ids: [id] });
          continue;
        }

        dispatch({ type: "start", id });
        if (!cell.source.trim()) {
          // Like Jupyter: running an empty cell just clears it.
          dispatch({ type: "finish", id, executionCount: null });
          continue;
        }

        try {
          const result = await kernel.execute(cell.source, {
            onOutput: (output) => dispatch({ type: "output", id, output }),
          });
          dispatch({ type: "finish", id, executionCount: result.executionCount });
          setLastRunFailed(result.status === "error");
          // Like Jupyter: after an error, the remaining queued cells are not run.
          if (result.status === "error") abortQueue();
        } catch {
          // The kernel was restarted or could not start; the kernel status explains why.
          dispatch({ type: "unqueue", ids: [id] });
          abortQueue();
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [store, dispatch, kernel, abortQueue]);

  const runCells = useCallback(
    (ids) => {
      const codeIds = ids.filter((id) => {
        const cell = store.getState().notebook.cells.find((item) => item.id === id);
        return cell?.cell_type === "code" && !queueRef.current.includes(id) && !store.getState().runState[id];
      });
      if (codeIds.length === 0) return;
      queueRef.current.push(...codeIds);
      dispatch({ type: "queue", ids: codeIds });
      processQueue();
    },
    [store, dispatch, processQueue]
  );

  const runAll = useCallback(() => {
    runCells(store.getState().notebook.cells.map((cell) => cell.id));
  }, [store, runCells]);

  const restartKernel = useCallback(() => {
    abortQueue();
    setLastRunFailed(false);
    return kernel.restart().catch(() => {}); // a failure shows in the kernel status
  }, [kernel, abortQueue]);

  /* ---------- Opening and replacing notebooks ---------- */

  const replaceNotebook = useCallback(
    (notebook) => {
      abortQueue();
      dispatch({ type: "replace", notebook });
      setPendingOpen(null);
      setLastRunFailed(false);
      // A different notebook gets a fresh kernel, as in Jupyter.
      if (kernel.getSnapshot().status !== "stopped") kernel.restart().catch(() => {});
    },
    [dispatch, abortQueue, kernel]
  );

  /* Reads an .ipynb file; opens it directly into an empty notebook, otherwise asks first. */
  const openFile = useCallback(
    async (file) => {
      setNotice(null);
      try {
        const notebook = await readNotebookFile(file);
        if (store.getState().notebook.cells.length === 0) replaceNotebook(notebook);
        else setPendingOpen(notebook);
      } catch (error) {
        setNotice({ kind: "error", text: error.message });
      }
    },
    [store, replaceNotebook]
  );

  const actions = useMemo(
    () => ({
      dispatch,
      getCells: () => store.getState().notebook.cells,
      save,
      runCells,
      runAll,
      interrupt: () => kernel.interrupt(),
      restartKernel,
      openFile,
      confirmOpen: () => pendingOpen && replaceNotebook(pendingOpen),
      cancelOpen: () => setPendingOpen(null),
      newNotebook: () => replaceNotebook(createNotebook()),
      dismissNotice: () => setNotice(null),
    }),
    [dispatch, store, save, runCells, runAll, kernel, restartKernel, openFile, pendingOpen, replaceNotebook]
  );

  return {
    notebook: state.notebook,
    runState: state.runState,
    saveInfo: { ...saveInfo, isDirty },
    notice,
    lastRunFailed,
    pendingOpen,
    actions,
  };
}
