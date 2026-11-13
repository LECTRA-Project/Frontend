/*
  Whether the notebook and the material viewer have switched places. The chat and the menu
  never move; on the right of the chat the panels are either
    chat | notebook | viewer   (the default: the viewer at the right edge)
    chat | viewer | notebook   (switched: the notebook at the right edge)
  Switched, both sit side by side (the notebook pinned), so neither covers the other.
  Saved per signed-in user in this browser.
*/
const KEY_PREFIX = "lectra:panels-switched:v1:";

export function loadPanelsSwitched(userKey) {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${userKey}`) === "1";
  } catch {
    return false;
  }
}

export function savePanelsSwitched(userKey, switched) {
  try {
    if (switched) localStorage.setItem(`${KEY_PREFIX}${userKey}`, "1");
    else localStorage.removeItem(`${KEY_PREFIX}${userKey}`);
  } catch {
    // Blocked storage: it still applies until the page is reloaded.
  }
}
