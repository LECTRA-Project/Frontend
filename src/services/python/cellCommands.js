/*
  Notebook commands inside code cells — LECTRA conveniences, not a shell.

  Python runs in the browser (Pyodide), so there is no operating-system shell and no
  desktop `pip`. A few familiar notebook lines are recognised instead:

    %pip install <package> …    install packages with the kernel's package installer
    !pip install <package> …    the same (also !pip3, !python -m pip, %pip3)
    %matplotlib inline          accepted and ignored: figures are always shown inline

  prepareCell() rewrites each recognised line, in place, into an ordinary Python call
  (`await __lectra_pip_install__("<json request>")`), so the rest of the cell keeps its
  line numbers and runs in order. Nothing is ever passed to a shell or to eval().
  Any other line starting with `!` or `%` raises a CellCommandError with a clear message.
*/

export const INSTALL_FUNCTION = "__lectra_pip_install__";

const SUPPORTED_SYNTAX = "%pip install package-name";

export class CellCommandError extends Error {
  constructor(message, line) {
    super(message);
    this.name = "CellCommandError";
    this.line = line; // 1-based line number in the cell
  }
}

const PIP_PREFIX = /^[%!](?:pip3?|python3?\s+-m\s+pip)(?=\s|$)/;
const OPTIONS = {
  "-q": "quiet",
  "--quiet": "quiet",
  "-U": "upgrade",
  "--upgrade": "upgrade",
  "--pre": "pre",
  "--no-deps": "noDeps",
};
// A PEP 508 name with optional [extras] and version specifiers, e.g. numpy, pandas>=2, requests[socks]==2.32.
const REQUIREMENT =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\[[A-Za-z0-9._,\s-]+\])?(?:\s*(?:===|==|!=|<=|>=|~=|<|>)\s*[A-Za-z0-9.*+!_-]+(?:\s*,\s*(?:===|==|!=|<=|>=|~=|<|>)\s*[A-Za-z0-9.*+!_-]+)*)?$/;
const WHEEL_URL = /^https?:\/\/[^\s'"]+\.whl$/i;
// (< and > are allowed: they are version specifiers such as pandas>=2.)
const SHELL_SYNTAX = /[;&|`$(){}]/;

/* Splits command arguments on spaces, honouring simple '…' / "…" quotes and stopping at a # comment. */
function splitArguments(text, line) {
  const args = [];
  let current = null;
  let quote = null;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      current ??= "";
    } else if (/\s/.test(char)) {
      if (current !== null) args.push(current);
      current = null;
    } else if (char === "#" && current === null) {
      break;
    } else {
      current = (current ?? "") + char;
    }
  }
  if (quote) throw new CellCommandError(`The quote (${quote}) in this command is never closed.`, line);
  if (current !== null) args.push(current);
  return args;
}

/* Parses the text after "%pip" into an install request, or throws CellCommandError. */
export function parsePipCommand(argumentText, line = 1) {
  if (SHELL_SYNTAX.test(argumentText.replace(/#.*$/, ""))) {
    throw new CellCommandError(
      "Only package names and pip options can follow %pip install — shell syntax such as ;, &&, | or $variables isn't available, because the notebook has no system shell.",
      line
    );
  }
  const [subcommand, ...rest] = splitArguments(argumentText, line);
  if (subcommand !== "install") {
    const what = subcommand ? `“pip ${subcommand}” isn't available` : "A pip command needs a subcommand";
    throw new CellCommandError(
      `${what} in the LECTRA notebook. Only installing is supported: ${SUPPORTED_SYNTAX} (for example %pip install seaborn).`,
      line
    );
  }

  const request = { packages: [], quiet: false, upgrade: false, pre: false, noDeps: false };
  for (const arg of rest) {
    if (arg.startsWith("-")) {
      const option = OPTIONS[arg];
      if (option) {
        request[option] = true;
        continue;
      }
      if (arg === "-r" || arg.startsWith("--requirement")) {
        throw new CellCommandError(
          "Requirements files (-r) aren't supported here. List the packages directly, for example %pip install numpy pandas.",
          line
        );
      }
      throw new CellCommandError(
        `The option ${arg} isn't supported. Supported options: -q/--quiet, -U/--upgrade, --pre, --no-deps.`,
        line
      );
    }
    if (!REQUIREMENT.test(arg) && !WHEEL_URL.test(arg)) {
      throw new CellCommandError(
        `“${arg}” isn't a valid package name. Use a name from PyPI, optionally with a version, for example %pip install "pandas>=2".`,
        line
      );
    }
    request.packages.push(arg);
  }
  if (request.packages.length === 0) {
    throw new CellCommandError(`Name at least one package to install: ${SUPPORTED_SYNTAX}.`, line);
  }
  return request;
}

/* Turns one command line (without its indentation) into Python, or throws CellCommandError. */
function translateCommand(command, line) {
  const pip = command.match(PIP_PREFIX);
  if (pip) {
    const request = parsePipCommand(command.slice(pip[0].length), line);
    // A JSON string is also a valid Python string literal.
    return `await ${INSTALL_FUNCTION}(${JSON.stringify(JSON.stringify(request))})`;
  }
  if (/^%matplotlib\s+inline\s*(#.*)?$/.test(command)) return "pass";

  if (command.startsWith("!")) {
    throw new CellCommandError(
      "Shell commands aren't available in the LECTRA notebook: Python runs in your browser, without a system shell. " +
        `To install a package, use ${SUPPORTED_SYNTAX}.`,
      line
    );
  }
  const magic = command.match(/^%%?[A-Za-z_]\w*/)?.[0] ?? command.split(/\s/)[0];
  throw new CellCommandError(
    `${magic} isn't available in the LECTRA notebook. The supported notebook commands are ${SUPPORTED_SYNTAX} and %matplotlib inline.`,
    line
  );
}

/*
  Tracks, line by line, whether the next line starts a new Python statement
  (not inside a triple-quoted string, open brackets or a backslash continuation).
*/
function scanLine(line, state) {
  let index = 0;
  let inComment = false;
  while (index < line.length) {
    const char = line[index];
    if (state.string) {
      if (char === "\\") index += 2;
      else if (line.startsWith(state.string, index)) {
        index += state.string.length;
        state.string = null;
      } else index += 1;
      continue;
    }
    if (char === "#") {
      inComment = true;
      break;
    }
    if (char === "'" || char === '"') {
      const triple = char.repeat(3);
      if (line.startsWith(triple, index)) {
        state.string = triple;
        index += 3;
        continue;
      }
      // A one-line string: skip to its closing quote.
      index += 1;
      while (index < line.length && line[index] !== char) index += line[index] === "\\" ? 2 : 1;
      index += 1;
      continue;
    }
    if ("([{".includes(char)) state.depth += 1;
    else if (")]}".includes(char)) state.depth = Math.max(0, state.depth - 1);
    index += 1;
  }
  state.continued = !state.string && !inComment && line.endsWith("\\");
}

/*
  Prepares a cell for Python: returns { code, commandCount }. `code` has the same number
  of lines as the input. Throws CellCommandError for an unsupported or invalid command.
*/
export function prepareCell(code) {
  const lines = code.split("\n");
  const state = { string: null, depth: 0, continued: false };
  let commandCount = 0;

  const prepared = lines.map((line, index) => {
    const startsStatement = !state.string && state.depth === 0 && !state.continued;
    const trimmed = line.trimStart();
    if (startsStatement && (trimmed.startsWith("!") || trimmed.startsWith("%"))) {
      commandCount += 1;
      const indent = line.slice(0, line.length - trimmed.length);
      state.continued = false;
      return indent + translateCommand(trimmed.trimEnd(), index + 1);
    }
    scanLine(line, state);
    return line;
  });

  return { code: prepared.join("\n"), commandCount };
}
