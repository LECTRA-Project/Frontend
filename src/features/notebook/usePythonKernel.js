import { useEffect, useState, useSyncExternalStore } from "react";

import { PythonKernel } from "../../services/python/pythonKernel.js";

/*
  One Python kernel for the workspace. It is created here but only starts (downloads
  Python) when something calls kernel.start() — the notebook view does that when it opens.
  Leaving the workspace shuts the kernel down.
*/
export function usePythonKernel() {
  const [kernel] = useState(() => new PythonKernel());
  const kernelState = useSyncExternalStore(kernel.subscribe, kernel.getSnapshot);

  useEffect(() => () => kernel.dispose(), [kernel]);

  return { kernel, kernelState };
}
