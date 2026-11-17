import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/*
  Keeps a scroll container at its bottom while new content arrives (an answer being typed
  out), but only while the reader is there: as soon as they scroll up (wheel, touch,
  keyboard, scrollbar), it stops and leaves the view exactly where they put it. Following
  starts again when they come back to the bottom, or with jumpToLatest().

    const stick = useStickToBottom(scrollRef);
    <div ref={scrollRef} {...stick.handlers}> … </div>
    stick.contentGrew()   new content arrived: follow it (once per frame), or offer the jump
    stick.keepAtBottom()  the content changed size (a diagram drawn): stay at the bottom if following
    stick.reset()         a new question or another chat: go to the bottom and follow again
    stick.showJump        true while the reader is scrolled up and new content arrived

  Auto-follow sets scrollTop directly (no smooth scrolling, which fights the reader) at most
  once per animation frame. Only scroll events that follow the reader's own input count as
  theirs; scroll changes made by the page (content above changing size) never stop following.
*/

// Within this distance of the bottom, scrolling down to it switches following back on.
export const NEAR_BOTTOM_PX = 80;
// How long after a wheel, touch or key event a scroll counts as the reader's.
const INTENT_MS = 300;
const UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"]);

export function distanceFromBottom(element) {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

function typingInto(target) {
  return target?.closest?.("input, textarea, select, [contenteditable='true']");
}

export default function useStickToBottom(scrollRef) {
  const following = useRef(true);
  const lastTop = useRef(0);
  const intentUntil = useRef(0);
  const dragging = useRef(false);
  const touchY = useRef(null);
  const frame = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const setFollowing = useCallback((value) => {
    following.current = value;
    if (value) setShowJump(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    lastTop.current = element.scrollTop;
  }, [scrollRef]);

  const followSoon = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (following.current) scrollToBottom();
    });
  }, [scrollToBottom]);

  const contentGrew = useCallback(() => {
    if (following.current) followSoon();
    else setShowJump(true);
  }, [followSoon]);

  const keepAtBottom = useCallback(() => {
    if (following.current) followSoon();
  }, [followSoon]);

  const reset = useCallback(() => {
    setFollowing(true);
    scrollToBottom();
  }, [setFollowing, scrollToBottom]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /*
    Keys scroll the chat also when the focus isn't in it (after clicking its text the focus is
    on the page), so they are watched on the window: keys pressed in the chat or on the page
    itself, not in a text field or another panel.
  */
  useEffect(() => {
    function onKeyDown(event) {
      const element = scrollRef.current;
      if (!element || typingInto(event.target)) return;
      const target = event.target;
      if (!(target === document.body || target === document.documentElement || element.contains(target))) return;
      intentUntil.current = Date.now() + INTENT_MS;
      const up = UP_KEYS.has(event.key) || (event.key === " " && event.shiftKey);
      if (up && element.scrollTop > 0) setFollowing(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scrollRef, setFollowing]);

  // The container's own events (spread on it).
  const handlers = useMemo(() => {
    const markIntent = () => {
      intentUntil.current = Date.now() + INTENT_MS;
    };
    // Only when there is something to scroll up to (a short chat can't be scrolled).
    const stopFollowing = (element) => {
      if (element.scrollTop > 0) setFollowing(false);
    };
    return {
      onWheel(event) {
        markIntent();
        if (event.deltaY < 0) stopFollowing(event.currentTarget);
      },
      onTouchStart(event) {
        markIntent();
        touchY.current = event.touches?.[0]?.clientY ?? null;
      },
      onTouchMove(event) {
        markIntent();
        const y = event.touches?.[0]?.clientY;
        // The finger moving down scrolls the content up.
        if (y !== undefined && touchY.current !== null && y > touchY.current + 2) stopFollowing(event.currentTarget);
        if (y !== undefined) touchY.current = y;
      },
      // A press on the container itself (its scrollbar): a drag of the scrollbar.
      onPointerDown(event) {
        if (event.target !== event.currentTarget) return;
        dragging.current = true;
        markIntent();
        window.addEventListener(
          "pointerup",
          () => {
            dragging.current = false;
            markIntent();
          },
          { once: true }
        );
      },
      onScroll(event) {
        const element = event.currentTarget;
        const top = element.scrollTop;
        const byReader = dragging.current || Date.now() < intentUntil.current;
        if (distanceFromBottom(element) <= 1) setFollowing(true);
        else if (byReader && top < lastTop.current) setFollowing(false);
        else if (byReader && top > lastTop.current && distanceFromBottom(element) <= NEAR_BOTTOM_PX) setFollowing(true);
        lastTop.current = top;
      },
    };
  }, [setFollowing]);

  const isFollowing = useCallback(() => following.current, []);

  // All but showJump keep their identity between renders.
  return { handlers, contentGrew, keepAtBottom, reset, jumpToLatest: reset, isFollowing, showJump };
}
