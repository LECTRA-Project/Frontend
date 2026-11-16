import { useEffect, useState } from "react";

/*
  Reveals a new answer word by word, like a streamed reply. The backend sends the whole
  answer at once; this only animates showing it.

  - Speed: about CHARS_PER_SECOND, but faster for long answers, so none takes longer
    than MAX_SECONDS.
  - Only answers that just arrived animate (`active`), once: an answer already revealed
    (also when the chat is left mid-way and opened again) shows in full.
  - Off with "reduce motion" in the operating system, and in tests (typingSettings).
*/
export const typingSettings = { enabled: true };

const TICK_MS = 40;
const CHARS_PER_SECOND = 90;
const MAX_SECONDS = 6;
const revealed = new Set(); // ids of answers already revealed

function reducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/* The end of the word at or after `index` (so a word never shows half-typed). */
function wordEnd(text, index) {
  if (index >= text.length) return text.length;
  const match = /\s/.exec(text.slice(index));
  return match ? index + match.index : text.length;
}

/* { text: the part to show now, typing: true until all of it is shown }. */
export default function useTypewriter(id, fullText, active) {
  // Decided once, when the answer is first shown.
  const [animate] = useState(() => Boolean(active) && typingSettings.enabled && !revealed.has(id) && !reducedMotion());
  const [shown, setShown] = useState(animate ? 0 : fullText.length);

  useEffect(() => {
    if (!animate) return undefined;
    const total = fullText.length;
    const perTick = Math.max(CHARS_PER_SECOND, total / MAX_SECONDS) * (TICK_MS / 1000);
    let length = 0;
    const timer = setInterval(() => {
      length = wordEnd(fullText, Math.ceil(length + perTick));
      setShown(length);
      if (length >= total) {
        clearInterval(timer);
        revealed.add(id);
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
      // Left mid-way (another chat, the Exam view): show it in full next time.
      revealed.add(id);
    };
  }, [animate, id, fullText]);

  if (!animate) return { text: fullText, typing: false };
  return { text: fullText.slice(0, shown), typing: shown < fullText.length };
}
