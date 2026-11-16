/* The keyboard shortcuts of the exam questions (ExamQuestions). */
/* Where the focus may be for a shortcut to act: nowhere in particular (the page) or in the
   exam, but not in a control that takes these keys itself. */
const TYPING = "textarea, select, [contenteditable=''], [contenteditable='true'], input:not([type='checkbox']):not([type='button'])";
const OWN_KEYS = "[role='slider'], [role='listbox'], [role='menu'], [role='menubar'], [role='tablist'], [role='grid'], [role='tree'], [role='dialog']";

/* The exam shortcut a keydown stands for, or null:
   { type: "choice", index } | { type: "previous" } | { type: "next" } | { type: "finish" }.
   state: { choices (how many can be toggled, 0 for none), canPrevious, canNext, canFinish }. */
export function shortcutFor(event, state) {
  if (event.defaultPrevented || (event.repeat && event.key === "Enter")) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (target && target !== document.body) {
    if (!target.closest(".exam")) return null;
    if (target.closest(TYPING) || target.closest(OWN_KEYS)) return null;
  }
  const key = event.key;
  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    return index < state.choices ? { type: "choice", index } : null;
  }
  if (key === "ArrowLeft") return state.canPrevious ? { type: "previous" } : null;
  if (key === "ArrowRight") return state.canNext ? { type: "next" } : null;
  if (key === "Enter") {
    // Enter on a button or a link does what that control does.
    if (target?.closest("button, a[href], summary, [role='button'], [role='link']")) return null;
    return state.canFinish ? { type: "finish" } : null;
  }
  return null;
}
