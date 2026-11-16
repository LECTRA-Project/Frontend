import { afterEach, describe, expect, it } from "vitest";

import { shortcutFor } from "./examShortcuts.js";

const ALL = { choices: 4, canPrevious: true, canNext: true, canFinish: true };

function inExam(html) {
  const root = document.createElement("section");
  root.className = "exam";
  root.innerHTML = html;
  document.body.append(root);
  return root.firstElementChild;
}

const press = (key, target = document.body, extra = {}) => ({ key, target, defaultPrevented: false, repeat: false, ...extra });

afterEach(() => document.body.replaceChildren());

describe("exam shortcuts", () => {
  it("maps 1 to 9 to the choices that exist", () => {
    expect(shortcutFor(press("1"), ALL)).toEqual({ type: "choice", index: 0 });
    expect(shortcutFor(press("4"), ALL)).toEqual({ type: "choice", index: 3 });
    expect(shortcutFor(press("5"), ALL)).toBeNull();
    expect(shortcutFor(press("0"), ALL)).toBeNull();
    expect(shortcutFor(press("1"), { ...ALL, choices: 0 })).toBeNull(); // a short answer or a locked exam
  });

  it("moves with the arrows and finishes with Enter only when allowed", () => {
    expect(shortcutFor(press("ArrowLeft"), ALL)).toEqual({ type: "previous" });
    expect(shortcutFor(press("ArrowRight"), ALL)).toEqual({ type: "next" });
    expect(shortcutFor(press("Enter"), ALL)).toEqual({ type: "finish" });
    const none = { choices: 0, canPrevious: false, canNext: false, canFinish: false };
    for (const key of ["ArrowLeft", "ArrowRight", "Enter"]) expect(shortcutFor(press(key), none)).toBeNull();
    expect(shortcutFor(press("ArrowUp"), ALL)).toBeNull();
  });

  it("acts in the exam: on a question heading, a checkbox or a map button", () => {
    expect(shortcutFor(press("2", inExam('<div tabindex="-1">Q</div>')), ALL)).toEqual({ type: "choice", index: 1 });
    expect(shortcutFor(press("ArrowRight", inExam('<input type="checkbox">')), ALL)).toEqual({ type: "next" });
    expect(shortcutFor(press("Enter", inExam('<input type="checkbox">')), ALL)).toEqual({ type: "finish" });
    expect(shortcutFor(press("ArrowLeft", inExam("<button>2</button>")), ALL)).toEqual({ type: "previous" });
  });

  it("never acts while typing or in a control that takes these keys", () => {
    for (const html of ["<textarea></textarea>", '<input type="text">', "<input>", "<select></select>", '<div contenteditable="true"></div>', '<div role="slider" tabindex="0"></div>', '<div role="dialog"><button>x</button></div>']) {
      const target = inExam(html);
      const inside = target.querySelector("button") ?? target;
      for (const key of ["1", "ArrowRight", "ArrowLeft", "Enter"]) expect(shortcutFor(press(key, inside), ALL), `${html} ${key}`).toBeNull();
    }
  });

  it("leaves Enter on buttons and links to them", () => {
    expect(shortcutFor(press("Enter", inExam("<button>Previous</button>")), ALL)).toBeNull();
    expect(shortcutFor(press("Enter", inExam('<a href="#x">x</a>')), ALL)).toBeNull();
  });

  it("ignores modifier keys, held Enter, handled keys and the rest of the app", () => {
    for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }, { defaultPrevented: true }]) {
      expect(shortcutFor(press("2", document.body, extra), ALL)).toBeNull();
    }
    expect(shortcutFor(press("Enter", document.body, { repeat: true }), ALL)).toBeNull();
    const outside = document.createElement("button");
    document.body.append(outside);
    expect(shortcutFor(press("ArrowRight", outside), ALL)).toBeNull();
  });
});
