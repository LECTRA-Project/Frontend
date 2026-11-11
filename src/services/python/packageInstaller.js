/*
  Package loading for the notebook kernel. Runs inside pyodideWorker.js.

  Two sources, both supported by Pyodide itself:
    - packages included in the configured Pyodide distribution (its lock file), loaded
      with pyodide.loadPackage from the same index URL Pyodide was loaded from;
    - other packages from PyPI through micropip, which can only install pure-Python
      wheels or wheels built for this Pyodide version.

  Nothing here claims success that did not happen: after every load the installed
  packages are checked, and failures come back with a readable explanation plus the
  underlying error.

  `pyodide` is the loaded Pyodide instance (tests pass a stand-in with the same shape).
*/

const PYPI_SIMPLE_URL = "https://pypi.org/simple/";
const BUNDLED_EXAMPLES = "numpy, pandas, scipy, scikit-learn and matplotlib";

/* PEP 503 name normalisation: "Scikit_Learn" → "scikit-learn". */
export function normalizeName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/* "pandas>=2" → "pandas", "requests[socks]" → "requests", a wheel URL → its project name. */
export function requirementName(requirement) {
  if (/\.whl$/i.test(requirement)) return requirement.split("/").pop().split("-")[0];
  return requirement.match(/^[A-Za-z0-9._-]+/)?.[0] ?? requirement;
}

function describeError(error) {
  if (error instanceof Error) return error.message || String(error);
  return String(error);
}

/* The final "SomeError: message" part of a Python traceback (Pyodide puts the whole traceback in .message). */
export function exceptionSummary(message) {
  const matches = [...message.matchAll(/^([A-Za-z_][\w.]*(?:Error|Exception|Warning)): /gm)];
  if (matches.length === 0) return message.trim();
  return message.slice(matches[matches.length - 1].index).trim();
}

const NETWORK_PATTERN = /failed to fetch|networkerror|network error|load failed|err_internet|err_name|err_connection|oserror|can't fetch wheel|timed out|timeout/i;

function quoteList(names) {
  return names.map((name) => `“${name}”`).join(", ");
}

/*
  Turns a micropip failure into { kind, message } for the student.
  kind: "incompatible" | "not-found" | "network" | "conflict" | "corrupt" | "failed"
  `probe(name)` resolves "found" | "missing" | "unreachable" | "unknown" by asking PyPI directly,
  because micropip reports a missing package and a blocked network with the same error.
*/
export async function explainInstallError(error, { requested, pyodideVersion, probe }) {
  const summary = exceptionSummary(describeError(error));
  // micropip's own advice to call micropip.install(..., keep_going=True) is not useful to a student.
  const details = `\nDetails: ${summary.replace(/\n?You can use `await micropip\.install[\s\S]*$/, "").trim()}`;
  const names = requested.map(requirementName);

  const noWheel = summary.match(/Can't find a pure Python 3 wheel for:? (.+)/);
  if (noWheel) {
    const failed = [...noWheel[1].matchAll(/'([^']+)'/g)].map((match) => requirementName(match[1]));
    const list = quoteList(failed.length > 0 ? failed : names);
    return {
      kind: "incompatible",
      message:
        `${list} can't be installed in this browser notebook. Python here runs on Pyodide ${pyodideVersion} ` +
        "(WebAssembly), which can only install pure-Python packages or packages built for Pyodide, and " +
        `${list} is available only with native code for desktop or server systems.\n` +
        `Use a package that runs here (${BUNDLED_EXAMPLES} are included with Pyodide), ` +
        "or run this code in a native Python environment such as a local Jupyter installation." +
        details,
    };
  }

  const noMetadata = summary.match(/Can't fetch metadata for '([^']+)'/);
  if (noMetadata) {
    const name = noMetadata[1];
    const found = await probe(name);
    if (found === "missing") {
      return {
        kind: "not-found",
        message:
          `No package named “${name}” was found on PyPI. Check the spelling — the install name can differ ` +
          "from the import name (for example, scikit-learn provides sklearn)." +
          details,
      };
    }
    if (found === "unreachable") {
      return {
        kind: "network",
        message:
          `PyPI (pypi.org) couldn't be reached to look up “${name}”. Check your internet connection ` +
          "(some school or company networks block pypi.org), then run the cell again." +
          details,
      };
    }
    return {
      kind: "failed",
      message: `The package information for “${name}” couldn't be read from PyPI. Run the cell again; if it keeps failing, the package can't be installed here.${details}`,
    };
  }

  if (/is already installed/.test(summary)) {
    return {
      kind: "conflict",
      message: `A different version is already loaded in this kernel. Restart the kernel to install another version.${details}`,
    };
  }
  if (/Invalid checksum/i.test(summary)) {
    return { kind: "corrupt", message: `A downloaded file was damaged (checksum mismatch). Run the cell again.${details}` };
  }
  if (/UnsupportedWheel|is not supported|not compatible|platform/i.test(summary)) {
    return {
      kind: "incompatible",
      message: `${quoteList(names)} isn't compatible with this browser runtime (Pyodide ${pyodideVersion}).${details}`,
    };
  }
  if (NETWORK_PATTERN.test(summary)) {
    return {
      kind: "network",
      message:
        "A download failed. Check your internet connection (the network may block pypi.org, " +
        `files.pythonhosted.org or the Pyodide CDN), then run the cell again.${details}`,
    };
  }
  return { kind: "failed", message: `${quoteList(names)} could not be installed.${details}` };
}

/* Asks PyPI whether a project exists, the way micropip looks it up. */
export async function probePyPI(name, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${PYPI_SIMPLE_URL}${normalizeName(name)}/`, {
      headers: { Accept: "application/vnd.pypi.simple.v1+json" },
    });
    if (response.status === 404) return "missing";
    return response.ok ? "found" : "unknown";
  } catch {
    return "unreachable";
  }
}

export function createPackageInstaller({ pyodide, indexURL, onProgress = () => {}, fetchImpl = globalThis.fetch }) {
  let micropipPromise = null;
  let importIndex = null;

  const host = (() => {
    try {
      return new URL(indexURL).host;
    } catch {
      return "the Pyodide package server";
    }
  })();

  const lockPackages = () => pyodide.lockfile?.packages ?? {};
  const isLoaded = (name) => Boolean(pyodide.loadedPackages[name]);

  /* import name → lock-file package name, e.g. "sklearn" → "scikit-learn". */
  function packageForImport(moduleName) {
    if (!importIndex) {
      importIndex = new Map();
      for (const [name, info] of Object.entries(lockPackages())) {
        for (const imported of info.imports ?? []) if (!importIndex.has(imported)) importIndex.set(imported, name);
      }
    }
    return importIndex.get(moduleName) ?? null;
  }

  /* Loads lock-file packages; resolves the names that did not load and the error messages seen. */
  async function loadBundled(names) {
    const errors = [];
    try {
      await pyodide.loadPackage(names, {
        messageCallback: (message) => onProgress(message),
        errorCallback: (message) => errors.push(message),
      });
    } catch (error) {
      errors.push(describeError(error));
    }
    return { failed: names.filter((name) => !isLoaded(name)), errors };
  }

  function bundledLoadError(failed, errors) {
    const reason = errors.join("\n").trim() || "the package files could not be downloaded";
    return (
      `${quoteList(failed)} ${failed.length === 1 ? "is" : "are"} included with Pyodide, but couldn't be downloaded from ${host}. ` +
      "Check your internet connection (the network may block the Pyodide CDN), then run the cell again." +
      `\nDetails: ${reason}`
    );
  }

  function getMicropip() {
    if (!micropipPromise) {
      micropipPromise = (async () => {
        if (!isLoaded("micropip")) {
          onProgress("Loading the package installer (micropip)…");
          const { failed, errors } = await loadBundled(["micropip"]);
          if (failed.length > 0) throw new Error(bundledLoadError(failed, errors));
        }
        return pyodide.pyimport("micropip");
      })();
      // Allow a retry after, for example, a network failure.
      micropipPromise.catch(() => {
        micropipPromise = null;
      });
    }
    return micropipPromise;
  }

  /* { normalized name: { name, version } } of every installed distribution. */
  function installedDistributions() {
    const json = pyodide.runPython(
      "import importlib.metadata as _m, json as _j\n" +
        "_j.dumps({d.metadata['Name']: d.version for d in _m.distributions() if d.metadata['Name']})"
    );
    const result = {};
    for (const [name, version] of Object.entries(JSON.parse(json))) result[normalizeName(name)] = { name, version };
    return result;
  }

  /*
    Loads the Pyodide packages that `code` imports (numpy, pandas, …), before the cell runs.
    Resolves null when everything needed is loaded, or an error message naming what failed.
  */
  async function loadImports(code) {
    let modules = [];
    try {
      const found = pyodide.pyodide_py.code.find_imports(code);
      modules = found.toJs();
      found.destroy?.();
    } catch {
      return null; // the cell itself will report its syntax error
    }
    const names = [...new Set(modules.map((name) => packageForImport(name.split(".")[0])).filter(Boolean))];
    const missing = names.filter((name) => !isLoaded(name));
    if (missing.length === 0) return null;

    onProgress(`Loading ${missing.join(", ")}…`);
    const { failed, errors } = await loadBundled(missing);
    onProgress("");
    if (failed.length === 0) return null;
    return `${bundledLoadError(failed, errors)}\nThe cell was not run.`;
  }

  /*
    Installs the packages of a %pip install request ({ packages, quiet, upgrade, pre, noDeps }).
    Resolves { status: "ok", text } with a pip-style summary, or { status: "error", kind, message }.
  */
  async function install(request) {
    const before = installedDistributions();
    const lock = lockPackages();
    const bundled = [];
    const fromIndex = [];
    for (const requirement of request.packages) {
      const name = normalizeName(requirementName(requirement));
      // A plain name of a package in the Pyodide distribution: load that exact build.
      if (requirementName(requirement) === requirement && lock[name]) bundled.push(name);
      else fromIndex.push(requirement);
    }

    try {
      if (bundled.length > 0) {
        onProgress(`Loading ${bundled.join(", ")} (included with Pyodide)…`);
        const { failed, errors } = await loadBundled(bundled);
        if (failed.length > 0) return { status: "error", kind: "network", message: bundledLoadError(failed, errors) };
      }

      if (fromIndex.length > 0) {
        let micropip;
        try {
          micropip = await getMicropip();
        } catch (error) {
          return { status: "error", kind: "network", message: describeError(error) };
        }
        onProgress(`Installing ${fromIndex.join(", ")}…`);
        const requirements = pyodide.toPy(fromIndex);
        try {
          await micropip.install.callKwargs(requirements, {
            deps: !request.noDeps,
            pre: Boolean(request.pre),
            reinstall: Boolean(request.upgrade),
          });
        } catch (error) {
          const explained = await explainInstallError(error, {
            requested: fromIndex,
            pyodideVersion: pyodide.version,
            probe: (name) => probePyPI(name, fetchImpl),
          });
          return { status: "error", ...explained };
        } finally {
          requirements.destroy?.();
        }
      }
    } finally {
      onProgress("");
    }

    const after = installedDistributions();
    const requestedKeys = request.packages.map((requirement) => normalizeName(requirementName(requirement)));
    const changed = Object.entries(after)
      // micropip itself is an implementation detail unless it was asked for.
      .filter(([key, dist]) => before[key]?.version !== dist.version && (key !== "micropip" || requestedKeys.includes(key)))
      .map(([, dist]) => `${dist.name}-${dist.version}`);
    const lines = [];
    for (const key of requestedKeys) {
      if (before[key] && after[key] && before[key].version === after[key].version) {
        lines.push(`Requirement already satisfied: ${after[key].name} ${after[key].version}`);
      }
    }
    if (changed.length > 0) lines.push(`Successfully installed ${changed.sort().join(" ")}`);
    return { status: "ok", text: request.quiet || lines.length === 0 ? "" : `${lines.join("\n")}\n` };
  }

  return { install, loadImports };
}
