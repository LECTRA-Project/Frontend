"""
LECTRA notebook kernel runtime.

Loaded once into Pyodide by pyodideWorker.js. It keeps the students' variables in
`user_ns` (shared by every cell until the kernel restarts), runs cells, and sends
rich outputs (results, display(), matplotlib figures) back to JavaScript as
Jupyter-style output dicts through the `_lectra_bridge` module.
"""

import base64
import builtins
import importlib.util
import io
import json
import linecache
import os
import sys
import traceback
import types

from _lectra_bridge import emit as _emit_json
from _lectra_bridge import install as _install_packages
from pyodide.code import eval_code_async

# The students' global namespace. It is separate from this module's globals, so
# the helpers below do not show up in dir() or clash with student variable names.
user_ns = {"__name__": "__main__", "__builtins__": builtins}

# Print as soon as a line is complete, so long-running cells stream their output.
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

_REPR_METHODS = (
    ("_repr_png_", "image/png"),
    ("_repr_jpeg_", "image/jpeg"),
    ("_repr_svg_", "image/svg+xml"),
    ("_repr_html_", "text/html"),
    ("_repr_markdown_", "text/markdown"),
    ("_repr_latex_", "text/latex"),
)

# Figures already shown by display()/a result, so the end-of-cell flush skips them.
_shown_figures = set()


def _emit(output):
    # Keep print() output that is still buffered ahead of this rich output.
    sys.stdout.flush()
    sys.stderr.flush()
    _emit_json(json.dumps(output))


def _safe_repr(obj):
    try:
        return repr(obj)
    except Exception as error:  # a broken __repr__ must not lose the cell's result
        return f"<repr() failed: {type(error).__name__}: {error}>"


def _figure_png(figure):
    buffer = io.BytesIO()
    figure.savefig(buffer, format="png", bbox_inches="tight")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def mime_bundle(obj):
    """The {mime type: data} dict Jupyter would produce for `obj`."""
    data = {"text/plain": _safe_repr(obj)}

    mpl_figure = sys.modules.get("matplotlib.figure")
    if mpl_figure is not None and isinstance(obj, mpl_figure.Figure):
        data["image/png"] = _figure_png(obj)
        _shown_figures.add(id(obj))
        return data

    # Classes have the _repr_*_ methods unbound; only instances can be rendered.
    if isinstance(obj, type):
        return data

    for method_name, mime in _REPR_METHODS:
        method = getattr(obj, method_name, None)
        if not callable(method):
            continue
        try:
            value = method()
        except Exception:
            continue
        if isinstance(value, tuple):  # (data, metadata)
            value = value[0]
        if isinstance(value, bytes) and mime in ("image/png", "image/jpeg"):
            value = base64.b64encode(value).decode("ascii")
        if isinstance(value, str):
            data[mime] = value
    return data


def display(*objects):
    """Show objects below the cell, like IPython's display()."""
    for obj in objects:
        _emit({"output_type": "display_data", "data": mime_bundle(obj), "metadata": {}})


def flush_figures():
    """Send every open matplotlib figure as a PNG, then close them (like %matplotlib inline)."""
    pyplot = sys.modules.get("matplotlib.pyplot")
    if pyplot is None:
        return
    try:
        for number in pyplot.get_fignums():
            figure = pyplot.figure(number)
            if id(figure) in _shown_figures:
                continue
            _emit(
                {
                    "output_type": "display_data",
                    "data": {"image/png": _figure_png(figure), "text/plain": _safe_repr(figure)},
                    "metadata": {},
                }
            )
    finally:
        pyplot.close("all")
        _shown_figures.clear()


def _input_unavailable(prompt=""):
    raise RuntimeError(
        "input() is not available in the LECTRA notebook: cells run without an interactive "
        'console. Assign the value directly instead, for example name = "Ada".'
    )


builtins.display = display
builtins.input = _input_unavailable


class PackageInstallError(Exception):
    """A %pip install line failed; the message explains why."""


async def _pip_install(request_json):
    """Runs one `%pip install …` line (rewritten by cellCommands.js) through the worker's installer."""
    result = json.loads(await _install_packages(request_json))
    if result["status"] != "ok":
        raise PackageInstallError(result["message"])
    importlib.invalidate_caches()
    if result["text"]:
        print(result["text"], end="")


# Called by the rewritten %pip lines. The dunder name keeps it out of the students' way.
builtins.__lectra_pip_install__ = _pip_install

# matplotlib backend selected through MPLBACKEND=module://lectra_mpl_backend.
# It renders with Agg (no browser DOM exists inside the worker) and plt.show()
# sends the figures to the cell output immediately. It is a real module file
# because matplotlib copies the backend module's attributes when it loads it.
_BACKEND_DIR = "/lectra"
_BACKEND_SOURCE = """\
import sys
from matplotlib.backend_bases import FigureManagerBase as FigureManager
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas


def show(*args, **kwargs):
    sys.modules["_lectra_runtime"].flush_figures()
"""

os.makedirs(_BACKEND_DIR, exist_ok=True)
with open(f"{_BACKEND_DIR}/lectra_mpl_backend.py", "w") as backend_file:
    backend_file.write(_BACKEND_SOURCE)
sys.path.append(_BACKEND_DIR)

_runtime_module = types.ModuleType("_lectra_runtime")
_runtime_module.flush_figures = flush_figures
sys.modules["_lectra_runtime"] = _runtime_module

_RUNTIME_FILES = ("<lectra-runtime>", f"{_BACKEND_DIR}/lectra_mpl_backend.py")


def _hide_runtime_frames(exception):
    """Removes this runtime's own frames, so students only see their code and libraries."""
    while exception is not None:
        exception.stack = traceback.StackSummary.from_list(
            [frame for frame in exception.stack if frame.filename not in _RUNTIME_FILES]
        )
        exception = exception.__cause__ or exception.__context__


def _missing_module_hint(error):
    """Extra advice for `import x` when x is not installed in this browser kernel."""
    top = (error.name or "").split(".")[0]
    if not top:
        return None
    try:
        if importlib.util.find_spec(top) is not None:
            return None  # the package exists; a submodule or dependency is missing
    except (ImportError, ValueError):
        pass
    return (
        f"No module named '{error.name}'. “{top}” isn't installed in this browser kernel. "
        f"If it is included with Pyodide or is a pure-Python package on PyPI, run %pip install {top} "
        "in a cell (the install name can differ from the module name), then run this cell again. "
        "Packages installed with %pip are cleared when the kernel restarts. Packages that need native "
        "code not built for Pyodide (for example torch) can't run in the browser."
    )


def _format_error(error, filename):
    if isinstance(error, PackageInstallError):
        # The failing line is the student's own %pip line; no Python frames are useful.
        return {"ename": "PackageInstallError", "evalue": str(error), "traceback": []}
    # Drop the frames of Pyodide's own runner; start at the student's cell.
    tb = error.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename != filename:
        tb = tb.tb_next
    summary = traceback.TracebackException(type(error), error, tb)
    _hide_runtime_frames(summary)
    text = "".join(summary.format())
    evalue = str(error)
    if isinstance(error, ModuleNotFoundError):
        evalue = _missing_module_hint(error) or evalue
    return {
        "ename": type(error).__name__,
        "evalue": evalue,
        "traceback": text.rstrip("\n").split("\n"),
    }


async def run_cell(code, execution_count, source=None):
    """Run one cell in the shared namespace. Returns a JSON status string.

    `code` is what runs (%pip lines already rewritten); `source` is what the student
    wrote, line for line, and is what tracebacks show.
    """
    filename = f"<cell In[{execution_count}]>"
    shown = code if source is None else source
    # Lets tracebacks show the source lines, also for functions defined in earlier cells.
    linecache.cache[filename] = (len(shown), None, shown.splitlines(True), filename)
    try:
        result = await eval_code_async(
            code,
            globals=user_ns,
            filename=filename,
            return_mode="last_expr",
            quiet_trailing_semicolon=True,
        )
        if result is not None:
            user_ns["_"] = result
            _emit(
                {
                    "output_type": "execute_result",
                    "execution_count": execution_count,
                    "data": mime_bundle(result),
                    "metadata": {},
                }
            )
        flush_figures()
        return json.dumps({"status": "ok"})
    except BaseException as error:  # also KeyboardInterrupt and SystemExit
        try:
            flush_figures()
        except Exception:
            pass
        return json.dumps({"status": "error", "error": _format_error(error, filename)})
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
