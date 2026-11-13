/*
  copyText(text) → true when the text is on the clipboard, false when it couldn't be put
  there (no Clipboard API, permission refused, insecure page…). Never claims a copy that
  didn't happen: the caller shows a manual fallback on false.

  Tries the Clipboard API first, then the older execCommand("copy") on a hidden textarea.
*/
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  return legacyCopy(text);
}

function legacyCopy(text) {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const active = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  active?.focus?.();
  return copied;
}
