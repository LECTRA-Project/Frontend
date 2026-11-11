/*
  Pill showing the state of the Python kernel.
  "Error" means the last cell raised an exception; the kernel itself still works.
*/
function describe(kernelState, lastRunFailed) {
  const version = kernelState.pythonVersion
    ? `Python ${kernelState.pythonVersion} (Pyodide ${kernelState.pyodideVersion}), running in your browser.`
    : "";

  switch (kernelState.status) {
    case "starting":
      return { tone: "busy", label: "Loading Python…", detail: kernelState.message || "Starting Python…" };
    case "busy":
      return {
        tone: "busy",
        label: kernelState.message ? "Busy · loading packages" : "Busy",
        detail: kernelState.message || `Running code. ${version}`,
      };
    case "idle":
      return lastRunFailed
        ? { tone: "error", label: "Error", detail: `The last cell raised an error. The kernel is still running. ${version}` }
        : { tone: "ready", label: "Idle", detail: `Python is ready. ${version}` };
    case "unavailable":
      return { tone: "error", label: "Unavailable", detail: kernelState.error };
    default:
      return { tone: "off", label: "Not started", detail: "Python starts when the notebook opens." };
  }
}

export default function KernelStatus({ kernelState, lastRunFailed }) {
  const { tone, label, detail } = describe(kernelState, lastRunFailed);
  return (
    <span className={`pill kernel-status kernel-status--${tone}`} title={detail} role="status">
      <span className="pill__dot" aria-hidden="true" />
      <span>
        <span className="visually-hidden">Kernel: </span>
        {label}
      </span>
    </span>
  );
}
