import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { dateLocale, germanDictionary, getLanguage, setCurrentLanguage, t, translate } from "./i18n.js";

const SRC = join(import.meta.dirname, "..");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" || name === "i18n" ? [] : sourceFiles(path);
    return /\.(js|jsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/* Every t("…") / t('…') text in the app (keys are always plain string literals). */
function usedTexts() {
  const found = new Map();
  const pattern = /\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1/g;
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, "utf8");
    for (const match of code.matchAll(pattern)) {
      const text = match[2].replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");
      if (!found.has(text)) found.set(text, relative(SRC, file));
    }
  }
  return found;
}

describe("interface translations", () => {
  afterEach(() => setCurrentLanguage("en"));

  it("has a German text for every translated interface text", () => {
    const de = germanDictionary();
    const missing = [...usedTexts()].filter(([text]) => !de[text]).map(([text, file]) => `${file}: ${text}`);
    expect(missing).toEqual([]);
  });

  it("keeps every placeholder in the German texts", () => {
    const names = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const wrong = Object.entries(germanDictionary()).filter(([en, de]) => names(en).join() !== names(de).join());
    expect(wrong).toEqual([]);
  });

  it("translates, fills placeholders and falls back to English", () => {
    expect(translate("{count} materials", { count: 3 }, "en")).toBe("3 materials");
    expect(translate("A text nobody translated", null, "de")).toBe("A text nobody translated");
    setCurrentLanguage("de");
    expect(getLanguage()).toBe("de");
    expect(t("Interface language")).toBe(germanDictionary()["Interface language"]);
    expect(dateLocale("en-GB")).toBe("de-DE");
    setCurrentLanguage("xx");
    expect(getLanguage()).toBe("en");
    expect(dateLocale("en-GB")).toBe("en-GB");
  });
});
