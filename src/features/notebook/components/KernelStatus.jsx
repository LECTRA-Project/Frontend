import { describeProgress } from "../../../services/python/pythonKernel.js";
import { useI18n } from "../../../i18n/i18n.js";

/*
  Pill showing the state of the Python kernel.
  "Error" means the last cell raised an exception; the kernel itself still works.
*/
function describe(kernelState, lastRunFailed, t) {
  const version = kernelState.pythonVersion
    ? t("Python {pythonVersion} (Pyodide {pyodideVersion}), running in your browser.", {
        pythonVersion: kernelState.pythonVersion,
        pyodideVersion: kernelState.pyodideVersion,
      })
    : "";
  const message = describeProgress(kernelState.message);

  switch (kernelState.status) {
    case "starting":
      return { tone: "busy", label: t("Loading Python…"), detail: message || t("Starting Python…") };
    case "busy":
      return {
        tone: "busy",
        label: kernelState.message ? t("Busy · loading packages") : t("Busy"),
        detail: message || t("Running code. {version}", { version }),
      };
    case "idle":
      return lastRunFailed
        ? {
            tone: "error",
            label: t("Error"),
            detail: t("The last cell raised an error. The kernel is still running. {version}", { version }),
          }
        : { tone: "ready", label: t("Idle"), detail: t("Python is ready. {version}", { version }) };
    case "unavailable":
      return { tone: "error", label: t("Unavailable"), detail: kernelState.error };
    default:
      return { tone: "off", label: t("Not started"), detail: t("Python starts when the notebook opens.") };
  }
}

export default function KernelStatus({ kernelState, lastRunFailed }) {
  const { t } = useI18n();
  const { tone, label, detail } = describe(kernelState, lastRunFailed, t);
  return (
    <span className={`pill kernel-status kernel-status--${tone}`} title={detail} role="status">
      <span className="pill__dot" aria-hidden="true" />
      <span>
        <span className="visually-hidden">{t("Kernel: ")}</span>
        {label}
      </span>
    </span>
  );
}
