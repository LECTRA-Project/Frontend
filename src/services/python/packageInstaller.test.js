import { describe, expect, it, vi } from "vitest";

import { createPackageInstaller, exceptionSummary, normalizeName, requirementName } from "./packageInstaller.js";

const INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

// micropip errors reach JavaScript as a PythonError whose message is the whole traceback.
function pythonError(summary) {
  return new Error(`Traceback (most recent call last):\n  File "/lib/python3.14/site-packages/micropip/x.py", line 1\n${summary}\n`);
}

/*
  A stand-in for the Pyodide instance: a lock file with a few packages, loadPackage,
  micropip (whose install() is supplied per test) and importlib.metadata through runPython.
*/
function fakePyodide({ micropipInstall = async () => {}, failDownloads = new Set() } = {}) {
  const installed = {}; // name → version, what importlib.metadata reports
  const pyodide = {
    version: "314.0.7",
    lockfile: {
      packages: {
        numpy: { name: "numpy", version: "2.4.6", imports: ["numpy"] },
        "scikit-learn": { name: "scikit-learn", version: "1.8.0", imports: ["sklearn"] },
        micropip: { name: "micropip", version: "0.11.1", imports: ["micropip"] },
      },
    },
    loadedPackages: {},
    loadPackage: vi.fn(async (names, { messageCallback, errorCallback } = {}) => {
      for (const name of [].concat(names)) {
        if (pyodide.loadedPackages[name]) continue;
        messageCallback?.(`Loading ${name}`);
        if (failDownloads.has(name)) {
          errorCallback?.(`Failed to load ${name}: TypeError: Failed to fetch`);
          continue;
        }
        pyodide.loadedPackages[name] = "default channel";
        installed[name] = pyodide.lockfile.packages[name].version;
      }
    }),
    pyodide_py: {
      code: {
        find_imports: (code) => ({ toJs: () => [...code.matchAll(/^\s*(?:import|from)\s+([\w.]+)/gm)].map((m) => m[1]) }),
      },
    },
    pyimport: vi.fn((name) => {
      if (name !== "micropip") throw new Error(`unexpected import ${name}`);
      return {
        install: {
          callKwargs: vi.fn(async (requirements, options) => {
            await micropipInstall(requirements, options, installed);
          }),
        },
      };
    }),
    toPy: (value) => value,
    runPython: () => JSON.stringify(installed),
  };
  return { pyodide, installed };
}

function installer(pyodide, fetchImpl = vi.fn()) {
  const progress = [];
  const api = createPackageInstaller({ pyodide, indexURL: INDEX_URL, onProgress: (m) => progress.push(m), fetchImpl });
  return { ...api, progress };
}

const request = (packages, options = {}) => ({ packages, quiet: false, upgrade: false, pre: false, noDeps: false, ...options });

describe("helpers", () => {
  it("normalises names and extracts the project name", () => {
    expect(normalizeName("Scikit_Learn")).toBe("scikit-learn");
    expect(requirementName("pandas>=2")).toBe("pandas");
    expect(requirementName("requests[socks]==2.32")).toBe("requests");
    expect(requirementName("https://x.org/a/my_pkg-1.0-py3-none-any.whl")).toBe("my_pkg");
  });

  it("keeps the final exception of a traceback, including its extra lines", () => {
    expect(exceptionSummary(pythonError("ValueError: Can't find a pure Python 3 wheel for 'torch'.\nSee: faq").message)).toBe(
      "ValueError: Can't find a pure Python 3 wheel for 'torch'.\nSee: faq"
    );
  });
});

describe("install", () => {
  it("loads a package from the Pyodide distribution with progress, and reports what was installed", async () => {
    const { pyodide } = fakePyodide();
    const { install, progress } = installer(pyodide);

    const result = await install(request(["numpy"]));

    expect(result).toEqual({ status: "ok", text: "Successfully installed numpy-2.4.6\n" });
    expect(pyodide.loadPackage).toHaveBeenCalledWith(["numpy"], expect.any(Object));
    expect(pyodide.pyimport).not.toHaveBeenCalled(); // micropip is not needed
    expect(progress).toContain("Loading numpy (included with Pyodide)…");
    expect(progress.at(-1)).toBe(""); // progress cleared at the end
  });

  it("installs other packages through micropip with the requested options", async () => {
    const micropipInstall = vi.fn(async (requirements, options, installed) => {
      installed.seaborn = "0.13.2";
    });
    const { pyodide } = fakePyodide({ micropipInstall });
    const { install } = installer(pyodide);

    const result = await install(request(["seaborn"], { pre: true, noDeps: true, upgrade: true }));

    expect(result).toEqual({ status: "ok", text: "Successfully installed seaborn-0.13.2\n" });
    expect(micropipInstall).toHaveBeenCalledWith(["seaborn"], { deps: false, pre: true, reinstall: true }, expect.any(Object));
    expect(pyodide.loadedPackages.micropip).toBeTruthy(); // micropip itself came from the distribution
  });

  it("does not install twice: a second request reports the package as already satisfied", async () => {
    const { pyodide } = fakePyodide();
    const { install } = installer(pyodide);
    await install(request(["numpy"]));
    pyodide.loadPackage.mockClear();

    const result = await install(request(["numpy"]));

    expect(result).toEqual({ status: "ok", text: "Requirement already satisfied: numpy 2.4.6\n" });
  });

  it("prints nothing on success with -q", async () => {
    const { pyodide } = fakePyodide();
    expect(await installer(pyodide).install(request(["numpy"], { quiet: true }))).toEqual({ status: "ok", text: "" });
  });

  it("explains that torch has no build for the browser instead of reporting success", async () => {
    const micropipInstall = async () => {
      throw pythonError(
        "ValueError: Can't find a pure Python 3 wheel for 'torch'.\nSee: https://pyodide.org/en/stable/usage/faq.html#why-can-t-micropip-find-a-pure-python-wheel-for-a-package\n" +
          "You can use `await micropip.install(..., keep_going=True)` to get a list of all packages with missing wheels."
      );
    };
    const { pyodide, installed } = fakePyodide({ micropipInstall });

    const result = await installer(pyodide).install(request(["torch"]));

    expect(result.status).toBe("error");
    expect(result.kind).toBe("incompatible");
    expect(result.message).toMatch(/“torch” can't be installed in this browser notebook/);
    expect(result.message).toMatch(/Pyodide 314\.0\.7/);
    expect(result.message).toMatch(/native Python environment/);
    expect(result.message).toMatch(/Details: ValueError: Can't find a pure Python 3 wheel for 'torch'/);
    expect(result.message).toMatch(/See: https:\/\/pyodide\.org/);
    expect(result.message).not.toMatch(/keep_going/);
    expect(installed.torch).toBeUndefined();
  });

  it("tells a misspelt package apart from a blocked network by asking PyPI", async () => {
    const micropipInstall = async () => {
      throw pythonError("ValueError: Can't fetch metadata for 'numpyy'. Please make sure you have entered a correct package name");
    };

    const missing = vi.fn(async () => ({ status: 404, ok: false }));
    const notFound = await installer(fakePyodide({ micropipInstall }).pyodide, missing).install(request(["numpyy"]));
    expect(notFound.kind).toBe("not-found");
    expect(notFound.message).toMatch(/No package named “numpyy” was found on PyPI/);
    expect(missing).toHaveBeenCalledWith("https://pypi.org/simple/numpyy/", expect.any(Object));

    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const network = await installer(fakePyodide({ micropipInstall }).pyodide, offline).install(request(["numpyy"]));
    expect(network.kind).toBe("network");
    expect(network.message).toMatch(/PyPI \(pypi\.org\) couldn't be reached/);
  });

  it("reports a failed download from the Pyodide CDN, and succeeds when retried", async () => {
    const failDownloads = new Set(["numpy"]);
    const { pyodide } = fakePyodide({ failDownloads });
    const { install } = installer(pyodide);

    const failed = await install(request(["numpy"]));
    expect(failed.status).toBe("error");
    expect(failed.kind).toBe("network");
    expect(failed.message).toMatch(/“numpy” is included with Pyodide, but couldn't be downloaded from cdn\.jsdelivr\.net/);
    expect(failed.message).toMatch(/Failed to fetch/);

    failDownloads.clear(); // the network is back
    expect(await install(request(["numpy"]))).toEqual({ status: "ok", text: "Successfully installed numpy-2.4.6\n" });
  });

  it("retries loading micropip after it failed once", async () => {
    const failDownloads = new Set(["micropip"]);
    const micropipInstall = vi.fn(async (requirements, options, installed) => {
      installed.six = "1.17.0";
    });
    const { pyodide } = fakePyodide({ micropipInstall, failDownloads });
    const { install } = installer(pyodide);

    expect((await install(request(["six"]))).kind).toBe("network");
    failDownloads.clear();
    expect(await install(request(["six"]))).toEqual({ status: "ok", text: "Successfully installed six-1.17.0\n" });
  });

  it("keeps the underlying error for anything else", async () => {
    const micropipInstall = async () => {
      throw pythonError("RuntimeError: something unexpected");
    };
    const result = await installer(fakePyodide({ micropipInstall }).pyodide).install(request(["oddpkg"]));
    expect(result).toMatchObject({ status: "error", kind: "failed" });
    expect(result.message).toBe("“oddpkg” could not be installed.\nDetails: RuntimeError: something unexpected");
  });
});

describe("loadImports", () => {
  it("loads the distribution packages a cell imports, by import name", async () => {
    const { pyodide } = fakePyodide();
    const { loadImports } = installer(pyodide);

    expect(await loadImports("import numpy as np\nfrom sklearn.linear_model import LinearRegression\nimport json")).toBeNull();
    expect(pyodide.loadedPackages).toMatchObject({ numpy: expect.any(String), "scikit-learn": expect.any(String) });
  });

  it("does nothing when everything is already loaded", async () => {
    const { pyodide } = fakePyodide();
    const { loadImports } = installer(pyodide);
    await loadImports("import numpy");
    pyodide.loadPackage.mockClear();
    expect(await loadImports("import numpy")).toBeNull();
    expect(pyodide.loadPackage).not.toHaveBeenCalled();
  });

  it("names the package that could not be loaded instead of failing silently", async () => {
    const { pyodide } = fakePyodide({ failDownloads: new Set(["numpy"]) });
    const message = await installer(pyodide).loadImports("import numpy");
    expect(message).toMatch(/“numpy” is included with Pyodide, but couldn't be downloaded/);
    expect(message).toMatch(/The cell was not run\./);
  });
});
