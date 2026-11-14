/*
  Mermaid diagrams in study assistant answers: a ```mermaid code block is replaced by the
  rendered SVG. Mermaid is large, so it is loaded only when an answer contains a diagram.
  securityLevel "strict" sanitises labels and disables click handlers in diagrams.
  A diagram that does not parse stays a code block, so the answer is never lost.
*/
const SELECTOR = "pre > code.language-mermaid";
let mermaidPromise = null;
let diagramCount = 0;

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: prefersDark() ? "dark" : "default",
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return mermaidPromise;
}

export function hasDiagrams(container) {
  return Boolean(container?.querySelector(SELECTOR));
}

/* Renders every Mermaid block in `container`; resolves when all are done. */
export async function renderDiagrams(container) {
  const blocks = [...(container?.querySelectorAll(SELECTOR) ?? [])];
  if (blocks.length === 0) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch {
    mermaidPromise = null;
    return;
  }
  for (const code of blocks) {
    const source = code.textContent ?? "";
    // The chat wraps code blocks in .chat-code (with a Copy button); replace the whole wrapper.
    const target = code.closest(".chat-code") ?? code.parentElement;
    if (!target?.isConnected) continue;
    const id = `chat-diagram-${++diagramCount}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (!target.isConnected) continue;
      const figure = document.createElement("figure");
      figure.className = "chat-diagram";
      figure.setAttribute("role", "img");
      figure.setAttribute("aria-label", "Diagram");
      figure.innerHTML = svg;
      target.replaceWith(figure);
    } catch {
      // Mermaid leaves its error element in the body when rendering fails.
      document.getElementById(`d${id}`)?.remove();
    }
  }
}
