import { beforeEach, describe, expect, it, vi } from "vitest";

// A plain stub, not vi.fn(): Vitest reports a rejection from a spy even when the code catches it.
let renderImpl;
const calls = [];
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: (...args) => {
      calls.push(args);
      return renderImpl(...args);
    },
  },
}));

const { hasDiagrams, renderDiagrams } = await import("./diagrams.js");

function answer(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.append(div);
  return div;
}

const MERMAID =
  '<div class="chat-code"><button>Copy</button><pre><code class="language-mermaid">flowchart TD\nA --> B</code></pre></div>';

describe("renderDiagrams", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("replaces a mermaid code block (with its Copy wrapper) by the diagram", async () => {
    renderImpl = async () => ({ svg: "<svg><text>A to B</text></svg>" });
    const div = answer(`<p>Intro</p>${MERMAID}`);
    expect(hasDiagrams(div)).toBe(true);
    await renderDiagrams(div);
    expect(calls[0][1]).toBe("flowchart TD\nA --> B");
    expect(div.querySelector(".chat-code")).toBeNull();
    expect(div.querySelector("figure.chat-diagram svg")).not.toBeNull();
    expect(div.querySelector("p").textContent).toBe("Intro");
  });

  it("keeps the code block when the diagram does not parse", async () => {
    renderImpl = async () => {
      throw new Error("Parse error");
    };
    const div = answer(MERMAID);
    await renderDiagrams(div);
    expect(calls).toHaveLength(1);
    expect(div.querySelector("code.language-mermaid")).not.toBeNull();
    expect(div.querySelector(".chat-diagram")).toBeNull();
  });

  it("leaves other code blocks alone", async () => {
    const div = answer('<pre><code class="language-python">print(1)</code></pre>');
    expect(hasDiagrams(div)).toBe(false);
    await renderDiagrams(div);
    expect(calls).toHaveLength(0);
    expect(div.querySelector("code.language-python")).not.toBeNull();
  });
});
