import { describe, expect, it } from "vitest";

import { CellCommandError, INSTALL_FUNCTION, parsePipCommand, prepareCell } from "./cellCommands.js";

function installRequest(line) {
  const match = line.match(new RegExp(`await ${INSTALL_FUNCTION}\\((.*)\\)$`));
  if (!match) throw new Error(`not an install call: ${line}`);
  return JSON.parse(JSON.parse(match[1]));
}

describe("prepareCell", () => {
  it("rewrites !pip install (the screenshot's command) into an install call", () => {
    const { code, commandCount } = prepareCell("!pip install torch");
    expect(commandCount).toBe(1);
    expect(installRequest(code)).toEqual({ packages: ["torch"], quiet: false, upgrade: false, pre: false, noDeps: false });
  });

  it("supports %pip, !pip3 and !python -m pip with several packages and options", () => {
    for (const prefix of ["%pip", "!pip3", "%pip3", "!python -m pip", "!python3 -m pip"]) {
      const { code } = prepareCell(`${prefix} install -q --upgrade seaborn "pandas>=2"`);
      expect(installRequest(code)).toMatchObject({ packages: ["seaborn", "pandas>=2"], quiet: true, upgrade: true });
    }
  });

  it("keeps the other lines, their order and the line count", () => {
    const source = "x = 1\n%pip install seaborn\nimport seaborn\nprint(x)";
    const { code } = prepareCell(source);
    const lines = code.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("x = 1");
    expect(installRequest(lines[1]).packages).toEqual(["seaborn"]);
    expect(lines.slice(2)).toEqual(["import seaborn", "print(x)"]);
  });

  it("keeps indentation of commands inside blocks", () => {
    const { code } = prepareCell("if True:\n    %pip install six");
    expect(code.split("\n")[1].startsWith(`    await ${INSTALL_FUNCTION}(`)).toBe(true);
  });

  it("leaves ordinary Python untouched, including ! and % inside strings, brackets and continuations", () => {
    const source = [
      'text = """',
      "!pip install not-a-command",
      '"""',
      "value = (10",
      "%3)",
      "total = 1 + \\",
      "% 2 if False else 0",
      "flag = x != 2  # !pip in a comment",
      "s = '!pip install no'",
    ].join("\n");
    expect(prepareCell(source)).toEqual({ code: source, commandCount: 0 });
  });

  it("accepts %matplotlib inline, since figures are always inline", () => {
    expect(prepareCell("%matplotlib inline\nimport matplotlib").code).toBe("pass\nimport matplotlib");
  });

  it("rejects other shell commands with a clear message and line number", () => {
    try {
      prepareCell("x = 1\n!ls -la");
      throw new Error("expected an error");
    } catch (error) {
      expect(error).toBeInstanceOf(CellCommandError);
      expect(error.line).toBe(2);
      expect(error.message).toMatch(/Shell commands aren't available/);
      expect(error.message).toMatch(/%pip install/);
    }
  });

  it("rejects unsupported magics", () => {
    expect(() => prepareCell("%timeit sum(range(10))")).toThrow(/%timeit isn't available/);
    expect(() => prepareCell("%%bash\necho hi")).toThrow(/%%bash isn't available/);
  });
});

describe("parsePipCommand", () => {
  it("parses packages and options", () => {
    expect(parsePipCommand(" install --pre --no-deps requests[socks]==2.32.3  # comment")).toEqual({
      packages: ["requests[socks]==2.32.3"],
      quiet: false,
      upgrade: false,
      pre: true,
      noDeps: true,
    });
  });

  it("accepts wheel URLs", () => {
    expect(parsePipCommand(" install https://example.org/pkg-1.0-py3-none-any.whl").packages).toEqual([
      "https://example.org/pkg-1.0-py3-none-any.whl",
    ]);
  });

  it.each([
    [" install", /Name at least one package/],
    [" uninstall numpy", /“pip uninstall” isn't available/],
    [" list", /“pip list” isn't available/],
    ["", /needs a subcommand/],
    [" install -r requirements.txt", /Requirements files/],
    [" install --index-url https://x numpy", /--index-url isn't supported/],
    [" install numpy; rm -rf /", /shell syntax/],
    [" install numpy && ls", /shell syntax/],
    [" install $PKG", /shell syntax/],
    [" install {pkg}", /shell syntax/],
    [" install ../local", /isn't a valid package name/],
    [' install "numpy', /never closed/],
  ])("rejects %pip%s", (text, message) => {
    expect(() => parsePipCommand(text)).toThrow(message);
  });
});
