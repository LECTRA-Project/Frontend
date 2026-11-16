import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { typingSettings } from "../features/workspace/useTypewriter.js";

// Answers show in full at once in tests; useTypewriter.test.js turns the animation on.
typingSettings.enabled = false;

/*
  Node 25+ ships its own experimental `localStorage` global, which hides jsdom's and has
  no working methods unless Node is started with --localstorage-file. Put a simple
  in-memory Storage in its place so tests behave like a browser.
*/
if (typeof globalThis.localStorage?.setItem !== "function") {
  const store = new Map();
  const memoryStorage = {
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true });
  if (typeof window !== "undefined" && window !== globalThis) {
    Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true });
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
