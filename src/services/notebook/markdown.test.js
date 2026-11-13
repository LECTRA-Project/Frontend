import { describe, expect, it } from "vitest";

import { renderAnswerMarkdown, renderMarkdown, sanitizeHtml } from "./markdown.js";

describe("renderMarkdown", () => {
  it("renders headings, emphasis, lists and links", () => {
    const html = renderMarkdown("# Title\n\n**bold** *it*\n\n- a\n\n1. one\n\n[site](https://example.org)");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders $math$ with KaTeX", () => {
    expect(renderMarkdown("Area: $\\pi r^2$")).toContain('class="katex"');
  });

  it("removes scripts, event handlers and javascript: links", () => {
    const html = renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(2)">\n\n[x](javascript:alert(3))');
    expect(html).not.toMatch(/<script|onerror|href="javascript:/);
    expect(html).toContain("<img");
  });
});

describe("sanitizeHtml", () => {
  it("keeps tables but drops <style>, which would restyle the whole app", () => {
    const html = sanitizeHtml("<style>body{display:none}</style><table><tr><td>1</td></tr></table>");
    expect(html).not.toContain("<style");
    expect(html).toContain("<td>1</td>");
  });
});

describe("renderAnswerMarkdown (chat answers)", () => {
  it("keeps dollar amounts as text instead of one long formula", () => {
    const html = renderAnswerMarkdown(
      "All three cost well under $1 per month even at the highest volume (25,000 SKUs/day). Totals of $121, $484, or $1,210."
    );
    expect(html).not.toContain("katex");
    expect(html).toContain("$1 per month");
    expect(html).toContain("$121, $484, or $1,210");
  });

  it("still renders real inline and display math", () => {
    expect(renderAnswerMarkdown("The index is $Gini(t) = 1 - p^2$, for each node.")).toContain("katex");
    expect(renderAnswerMarkdown("$$\\Delta = I(parent)$$")).toContain("katex-display");
  });
});
