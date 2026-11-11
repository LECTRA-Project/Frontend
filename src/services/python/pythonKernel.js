/*
  PythonKernel — the main-thread side of the notebook's Python kernel.

  Owns one pyodideWorker.js at a time. Variables persist between execute() calls
  because they all run in the same worker; restart() replaces the worker, which
  clears everything.

  Status (getSnapshot().status):
    "stopped"      not started yet (Python is only downloaded when a notebook opens)
    "starting"     downloading / initialising Python
    "idle"         ready
    "busy"         running a cell
    "unavailable"  Python failed to load; `error` says why, start() retries

  Interrupting:
    When the page is cross-origin isolated, a SharedArrayBuffer lets us raise a real
    KeyboardInterrupt inside Python and keep the variables. Otherwise (the default dev
    setup) the only way to stop running WebAssembly is to terminate the worker, so an
    interrupt restarts the kernel and the cell's output says so.
*/

export const PYODIDE_VERSION = "314.0.7";
export const PYODIDE_INDEX_URL =
  import.meta.env.VITE_PYODIDE_INDEX_URL || `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// A single cell may run this long before it is interrupted.
export const EXECUTION_TIMEOUT_MS = 2 * 60 * 1000;
const LOAD_TIMEOUT_MS = 2 * 60 * 1000;
// After a KeyboardInterrupt request, wait this long before terminating the worker.
const SOFT_INTERRUPT_GRACE_MS = 3000;

/* Rejection reason when an execution never got a result (kernel restarted or unavailable). */
export class KernelError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "KernelError";
    this.code = code; // "restarted" | "unavailable" | "disposed"
  }
}

function createPyodideWorker() {
  return new Worker(new URL("./pyodideWorker.js", import.meta.url), { type: "module", name: "lectra-python" });
}

function createInterruptBuffer() {
  if (typeof SharedArrayBuffer === "undefined" || !globalThis.crossOriginIsolated) return null;
  return new Int32Array(new SharedArrayBuffer(4));
}

export class PythonKernel {
  constructor({
    indexURL = PYODIDE_INDEX_URL,
    createWorker = createPyodideWorker,
    executionTimeoutMs = EXECUTION_TIMEOUT_MS,
    loadTimeoutMs = LOAD_TIMEOUT_MS,
  } = {}) {
    this.indexURL = indexURL;
    this.createWorker = createWorker;
    this.executionTimeoutMs = executionTimeoutMs;
    this.loadTimeoutMs = loadTimeoutMs;

    this.listeners = new Set();
    this.worker = null;
    this.generation = 0; // ignores messages from a worker that was already replaced
    this.ready = null; // promise for the current worker becoming ready
    this.pendingStart = null; // { resolve, reject, timer }
    this.current = null; // the running execution
    this.queue = Promise.resolve(); // executions run one after another
    this.nextId = 0;
    this.executionCount = 0;
    this.interruptBuffer = null;

    this.snapshot = {
      status: "stopped",
      message: "",
      error: null,
      pythonVersion: null,
      pyodideVersion: null,
      canSoftInterrupt: false,
    };
  }

  /* ---------- Subscription (for useSyncExternalStore) ---------- */

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  setSnapshot(changes) {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }

  /* ---------- Lifecycle ---------- */

  /* Starts Python if needed. Resolves once it is ready; rejects with KernelError if loading fails. */
  start() {
    if (this.ready) return this.ready;

    const generation = ++this.generation;
    this.interruptBuffer = createInterruptBuffer();
    this.setSnapshot({
      status: "starting",
      message: "Starting Python…",
      error: null,
      canSoftInterrupt: Boolean(this.interruptBuffer),
    });

    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.failStart(
          generation,
          `Python did not finish loading within ${Math.round(this.loadTimeoutMs / 1000)} seconds. ` +
            "Check your internet connection (Python is downloaded from the Pyodide CDN) and retry."
        );
      }, this.loadTimeoutMs);
      this.pendingStart = { resolve, reject, timer };
    });
    // Callers that do not wait on start() must not cause "unhandled rejection" noise.
    ready.catch(() => {});
    this.ready = ready;

    let worker;
    try {
      worker = this.createWorker();
    } catch (error) {
      this.failStart(generation, `This browser could not start a Python worker: ${error.message}`);
      return ready;
    }
    this.worker = worker;
    worker.onmessage = (event) => this.handleMessage(generation, event.data);
    worker.onerror = (event) => {
      event.preventDefault?.();
      this.handleCrash(generation, event.message || "The Python worker stopped unexpectedly.");
    };
    worker.postMessage({ type: "init", indexURL: this.indexURL, interruptBuffer: this.interruptBuffer });

    return ready;
  }

  /* Clears all variables by replacing the worker. A running cell is abandoned (its promise rejects). */
  restart() {
    this.stopWorker(new KernelError("The kernel was restarted.", "restarted"));
    return this.start();
  }

  /* Stops Python for good (e.g. when leaving the workspace). start() may be called again later. */
  dispose() {
    this.stopWorker(new KernelError("The kernel was shut down.", "disposed"));
    this.setSnapshot({ status: "stopped", message: "", error: null });
  }

  stopWorker(reason) {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.executionCount = 0;

    if (this.pendingStart) {
      clearTimeout(this.pendingStart.timer);
      this.pendingStart.reject(reason);
      this.pendingStart = null;
    }
    if (this.current) {
      const execution = this.current;
      this.current = null;
      this.clearExecutionTimers(execution);
      execution.reject(reason);
    }
  }

  failStart(generation, message) {
    if (generation !== this.generation || !this.pendingStart) return;
    const { reject, timer } = this.pendingStart;
    clearTimeout(timer);
    this.pendingStart = null;
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    this.ready = null; // so the next start() retries
    this.setSnapshot({ status: "unavailable", message: "", error: message });
    reject(new KernelError(message, "unavailable"));
  }

  /* ---------- Execution ---------- */

  /*
    Runs `code` in the shared namespace. `onOutput(output)` receives each Jupyter-style
    output dict as it arrives. Resolves { status: "ok" | "error", executionCount }.
    Rejects with KernelError when Python is unavailable or the kernel is restarted meanwhile.
  */
  execute(code, { onOutput = () => {} } = {}) {
    const run = this.queue.then(() => this.runNow(code, onOutput));
    this.queue = run.catch(() => {});
    return run;
  }

  async runNow(code, onOutput) {
    // If the kernel restarts while we wait, wait for the new one instead.
    let ready;
    do {
      ready = this.start();
      await ready;
    } while (ready !== this.ready);

    return new Promise((resolve, reject) => {
      const execution = {
        id: ++this.nextId,
        executionCount: ++this.executionCount,
        onOutput,
        resolve,
        reject,
        timeoutTimer: null,
        graceTimer: null,
        stopReason: null, // "interrupt" | "timeout"
      };
      this.current = execution;
      this.setSnapshot({ status: "busy", message: "" });
      this.worker.postMessage({ type: "execute", id: execution.id, code, executionCount: execution.executionCount });
    });
  }

  /* Stops the running cell, if any. */
  interrupt() {
    this.stopExecution("interrupt");
  }

  stopExecution(reason) {
    const execution = this.current;
    if (!execution || execution.stopReason) return;
    execution.stopReason = reason;

    if (this.interruptBuffer) {
      this.interruptBuffer[0] = 2; // SIGINT → KeyboardInterrupt inside Python
      execution.graceTimer = setTimeout(() => this.hardStop(execution), SOFT_INTERRUPT_GRACE_MS);
    } else {
      this.hardStop(execution);
    }
  }

  /* Terminates the worker to stop a cell that cannot be interrupted, then starts a fresh kernel. */
  hardStop(execution) {
    if (this.current !== execution) return;
    this.current = null;
    this.clearExecutionTimers(execution);

    const what =
      execution.stopReason === "timeout"
        ? `The cell ran longer than ${Math.round(this.executionTimeoutMs / 1000)} seconds and was stopped.`
        : "The cell was stopped.";
    execution.onOutput({
      output_type: "error",
      ename: execution.stopReason === "timeout" ? "TimeoutError" : "KeyboardInterrupt",
      evalue: `${what} Python had to be restarted to stop it, so all variables were cleared.`,
      traceback: [],
    });
    execution.resolve({ status: "error", executionCount: execution.executionCount });

    this.stopWorker(new KernelError("The kernel was restarted.", "restarted"));
    this.start();
  }

  clearExecutionTimers(execution) {
    clearTimeout(execution.timeoutTimer);
    clearTimeout(execution.graceTimer);
  }

  /* ---------- Worker messages ---------- */

  handleMessage(generation, message) {
    if (generation !== this.generation) return;
    const execution = this.current;

    switch (message.type) {
      case "progress":
        this.setSnapshot({ message: message.message });
        break;

      case "ready":
        if (!this.pendingStart) break;
        clearTimeout(this.pendingStart.timer);
        this.pendingStart.resolve();
        this.pendingStart = null;
        this.setSnapshot({
          status: this.current ? "busy" : "idle",
          message: "",
          error: null,
          pythonVersion: message.pythonVersion,
          pyodideVersion: message.pyodideVersion,
        });
        break;

      case "init-error":
        this.failStart(generation, `Python could not be loaded: ${message.message}`);
        break;

      case "started":
        if (execution?.id !== message.id) break;
        this.setSnapshot({ message: "" });
        execution.timeoutTimer = setTimeout(() => this.stopExecution("timeout"), this.executionTimeoutMs);
        break;

      case "output":
        if (execution?.id === message.id) execution.onOutput(message.output);
        break;

      case "result": {
        if (execution?.id !== message.id) break;
        this.current = null;
        this.clearExecutionTimers(execution);

        if (message.error) {
          let { error } = message;
          if (execution.stopReason === "timeout" && error.ename === "KeyboardInterrupt") {
            const seconds = Math.round(this.executionTimeoutMs / 1000);
            error = { ...error, ename: "TimeoutError", evalue: `The cell ran longer than ${seconds} seconds and was interrupted.` };
          }
          execution.onOutput({ output_type: "error", ...error });
        }
        execution.resolve({ status: message.status, executionCount: execution.executionCount });

        if (message.fatal) {
          this.stopWorker(new KernelError("The kernel was restarted.", "restarted"));
          this.start();
        } else {
          this.setSnapshot({ status: "idle", message: "" });
        }
        break;
      }

      default:
        break;
    }
  }

  handleCrash(generation, reason) {
    if (generation !== this.generation) return;
    if (this.pendingStart) {
      this.failStart(generation, `Python could not be loaded: ${reason}`);
      return;
    }
    const execution = this.current;
    if (execution) {
      this.current = null;
      this.clearExecutionTimers(execution);
      execution.onOutput({
        output_type: "error",
        ename: "KernelError",
        evalue: `Python crashed (${reason}). It has been restarted, so all variables were cleared.`,
        traceback: [],
      });
      execution.resolve({ status: "error", executionCount: execution.executionCount });
    }
    this.stopWorker(new KernelError("The kernel crashed.", "restarted"));
    this.start();
  }
}
