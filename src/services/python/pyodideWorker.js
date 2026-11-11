import RUNTIME_SOURCE from "./kernelRuntime.py?raw";

/*
  Python kernel worker (one worker = one kernel).

  Runs Pyodide (CPython compiled to WebAssembly) off the main thread, so a long or
  endless cell never freezes the page. The students' variables live in this worker
  until it is terminated, which is how "Restart kernel" clears them.

  The worker has no access to the page, its DOM, localStorage or the sign-in token;
  it only receives the code of the cell being run.

  Messages in (from pythonKernel.js):
    { type: "init", indexURL, interruptBuffer }   interruptBuffer: Int32Array on a SharedArrayBuffer, or null
    { type: "execute", id, code, executionCount }

  Messages out:
    { type: "progress", message }                       loading Python or packages
    { type: "ready", pythonVersion, pyodideVersion }
    { type: "init-error", message }
    { type: "started", id }                             packages loaded, the code itself starts
    { type: "output", id, output }                      a Jupyter output dict (stream, display_data, execute_result)
    { type: "result", id, status: "ok" | "error", error?, fatal? }
*/

// Per-cell cap on printed text, so `while True: print(...)` cannot exhaust memory.
const MAX_STREAM_CHARS = 500_000;
// Send printed text at most this often (ms) while a cell is still running.
const STREAM_FLUSH_MS = 50;

let pyodide = null;
let runCell = null;
let interruptBuffer = null;

// The execution in progress: { id, streamedChars, truncated }
let current = null;
let pendingStream = null; // { name, text } not yet posted
let lastFlush = 0;
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") init(message);
  else if (message.type === "execute") execute(message);
};

function post(message) {
  self.postMessage(message);
}

async function init({ indexURL, interruptBuffer: buffer }) {
  try {
    post({ type: "progress", message: "Downloading Python…" });
    const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
    pyodide = await loadPyodide({
      indexURL,
      env: { MPLBACKEND: "module://lectra_mpl_backend", HOME: "/home/pyodide" },
    });

    pyodide.setStdout({ write: (bytes) => writeStream("stdout", bytes) });
    pyodide.setStderr({ write: (bytes) => writeStream("stderr", bytes) });
    pyodide.registerJsModule("_lectra_bridge", { emit: (json) => emitOutput(JSON.parse(json)) });

    if (buffer) {
      interruptBuffer = buffer;
      pyodide.setInterruptBuffer(buffer);
    }

    const namespace = pyodide.globals.get("dict")();
    pyodide.runPython(RUNTIME_SOURCE, { globals: namespace, filename: "<lectra-runtime>" });
    runCell = namespace.get("run_cell");
    const pythonVersion = pyodide.runPython("import sys; sys.version.split()[0]");

    post({ type: "ready", pythonVersion, pyodideVersion: pyodide.version });
  } catch (error) {
    post({ type: "init-error", message: describe(error) });
  }
}

async function execute({ id, code, executionCount }) {
  current = { id, streamedChars: 0, truncated: false };
  if (interruptBuffer) interruptBuffer[0] = 0;

  try {
    // Fetch packages from the Pyodide distribution that the cell imports (numpy, pandas, …).
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: (message) => post({ type: "progress", message }),
      errorCallback: (message) => post({ type: "progress", message }),
    });
  } catch (error) {
    // The import itself will then fail inside Python with a normal ImportError.
    post({ type: "progress", message: `Could not load packages: ${describe(error)}` });
  }

  post({ type: "started", id });
  let result;
  try {
    result = JSON.parse(await runCell(code, executionCount));
  } catch (error) {
    // run_cell catches every Python exception, so reaching this means Pyodide itself broke.
    result = {
      status: "error",
      fatal: true,
      error: { ename: "KernelError", evalue: describe(error), traceback: [] },
    };
  }
  flushStream(true);
  current = null;
  post({ type: "result", id, ...result });
}

function writeStream(name, bytes) {
  queueStream(name, decoders[name].decode(bytes, { stream: true }));
  return bytes.length;
}

function queueStream(name, text) {
  if (!current || !text) return;
  if (current.truncated) return;

  if (current.streamedChars + text.length > MAX_STREAM_CHARS) {
    text = text.slice(0, Math.max(0, MAX_STREAM_CHARS - current.streamedChars));
    current.truncated = true;
  }
  current.streamedChars += text.length;

  if (pendingStream && pendingStream.name !== name) flushStream();
  if (!pendingStream) pendingStream = { name, text: "" };
  pendingStream.text += text;

  if (current.truncated) {
    flushStream();
    post({
      type: "output",
      id: current.id,
      output: {
        output_type: "stream",
        name: "stderr",
        text: `\n[LECTRA: output truncated after ${MAX_STREAM_CHARS.toLocaleString("en")} characters. The cell keeps running.]\n`,
      },
    });
    return;
  }
  // Python may run for a long time without yielding, so flush from inside the write call.
  if (Date.now() - lastFlush >= STREAM_FLUSH_MS) flushStream();
}

function flushStream(final = false) {
  if (final) {
    for (const name of Object.keys(decoders)) queueStream(name, decoders[name].decode());
  }
  if (pendingStream && current) {
    post({ type: "output", id: current.id, output: { output_type: "stream", ...pendingStream } });
  }
  pendingStream = null;
  lastFlush = Date.now();
}

function emitOutput(output) {
  if (!current) return;
  flushStream();
  post({ type: "output", id: current.id, output });
}

function describe(error) {
  if (error instanceof Error) return error.message || String(error);
  return String(error);
}
