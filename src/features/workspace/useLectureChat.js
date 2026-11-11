import { useCallback, useEffect, useRef, useState } from "react";

import {
  createChatSession,
  deleteChatSession,
  listAllChatMessages,
  listAllChatSessions,
  renameChatSession,
  sendChatMessage,
} from "../../api/services/chat.js";

/*
  Saved lecture chats (the Lecture Chat API) for the Study Assistant.

  - Loads the student's chat sessions when `enabled` (most recently active first).
  - openSession(id) loads that chat's messages; startNewChat() clears the view, and the
    next send() creates a session for the chosen lecture first.
  - send() shows the question at once, then replaces it with the saved question and the
    answer. The backend saves nothing when answering fails, so a failed question stays
    visible with the error and can simply be asked again.

  Messages in state: { id, role: "user" | "assistant" | "system", content, sources, extras }
  (extras: what the student added — notebook cell and material labels, shown under the question).
*/
/*
  After a timed-out question: the session's saved messages if they end with the answer to
  `question` (the saved question may carry an appended notebook block), else null.
*/
async function findSavedAnswer(sessionId, question) {
  try {
    const list = await listAllChatMessages(sessionId);
    const [asked, answer] = list.slice(-2);
    return asked?.role === "user" && asked.content.startsWith(question) && answer?.role === "assistant" ? list : null;
  } catch {
    return null;
  }
}

export function useLectureChat({ enabled }) {
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(enabled);
  const [sessionsError, setSessionsError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const messagesRequest = useRef(null);
  // The chat on screen, readable after an await (a send can finish after the student switched chats).
  const activeRef = useRef(null);

  const select = useCallback((id) => {
    activeRef.current = id;
    setActiveId(id);
  }, []);

  const loadSessions = useCallback(async ({ signal } = {}) => {
    setSessionsLoading(true);
    try {
      const list = await listAllChatSessions({ signal });
      setSessions(list);
      setSessionsError(null);
    } catch (err) {
      if (signal?.aborted || err?.name === "CanceledError") return;
      setSessionsError(err.message || "Your chats could not be loaded.");
    } finally {
      if (!signal?.aborted) setSessionsLoading(false);
    }
  }, []);

  // Initial load (`sessionsLoading` already starts true, so state is only set once it settles).
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    listAllChatSessions({ signal: controller.signal }).then(
      (list) => {
        setSessions(list);
        setSessionsLoading(false);
      },
      (err) => {
        if (controller.signal.aborted) return;
        setSessionsError(err.message || "Your chats could not be loaded.");
        setSessionsLoading(false);
      }
    );
    return () => controller.abort();
  }, [enabled]);

  useEffect(() => () => messagesRequest.current?.abort(), []);

  const putSession = useCallback((session, { toTop = false } = {}) => {
    setSessions((list) => {
      const others = list.filter((item) => item.id !== session.id);
      if (toTop) return [session, ...others];
      const index = list.findIndex((item) => item.id === session.id);
      if (index === -1) return [session, ...others];
      const next = [...list];
      next[index] = session;
      return next;
    });
  }, []);

  const openSession = useCallback(
    async (id) => {
      messagesRequest.current?.abort();
      const controller = new AbortController();
      messagesRequest.current = controller;
      select(id);
      setMessages([]);
      setMessagesLoading(true);
      try {
        const list = await listAllChatMessages(id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setMessages(list.map((message) => ({ ...message, extras: [] })));
      } catch (err) {
        if (controller.signal.aborted || err?.name === "CanceledError") return;
        setMessages([{ id: crypto.randomUUID(), role: "system", content: err.message || "This chat could not be loaded." }]);
      } finally {
        if (!controller.signal.aborted) setMessagesLoading(false);
      }
    },
    [select]
  );

  const startNewChat = useCallback(() => {
    messagesRequest.current?.abort();
    select(null);
    setMessages([]);
    setMessagesLoading(false);
  }, [select]);

  /*
    Asks `content` in the open chat, or — when no chat is open, or it is about another
    lecture — in a new chat about `lectureId`. `question` is what the student typed
    (shown in the list); `content` is what is sent (it may carry notebook context).
    Resolves true once answered, false on failure (the error is shown in the chat).
  */
  const send = useCallback(
    async ({ lectureId, question, content, extras = [] }) => {
      const pendingId = crypto.randomUUID();
      const current = sessions.find((item) => item.id === activeRef.current);
      const reuse = current && current.lecture?.id === lectureId;
      if (!reuse && current) {
        select(null);
        setMessages([]);
      }
      setMessages((list) => [...list, { id: pendingId, role: "user", content: question, extras, pending: true }]);
      setBusy(true);
      let sessionId = reuse ? current.id : null;
      try {
        if (!sessionId) {
          const created = await createChatSession({ lectureId });
          sessionId = created.id;
          putSession(created, { toTop: true });
          if (activeRef.current === null) select(created.id);
        }
        const result = await sendChatMessage(sessionId, content);
        putSession(result.session, { toTop: true });
        if (activeRef.current === sessionId) {
          setMessages((list) => [
            ...list.filter((message) => message.id !== pendingId),
            // Show what the student typed, not the notebook block appended to it.
            { ...result.question, content: question, extras },
            { ...result.answer, extras: [] },
          ]);
        }
        return true;
      } catch (err) {
        // Timed out: the backend keeps going and saves the answer, so look for it.
        if (err?.code === "ECONNABORTED" && sessionId) {
          const saved = await findSavedAnswer(sessionId, question);
          if (saved) {
            if (activeRef.current === sessionId) {
              const asked = saved.at(-2).id;
              setMessages(saved.map((item) => (item.id === asked ? { ...item, content: question, extras } : { ...item, extras: [] })));
            }
            return true;
          }
        }
        const message =
          err?.code === "ECONNABORTED" && sessionId
            ? "The assistant is taking longer than usual. Your answer may still arrive — open this chat again from Chats in a minute."
            : err.message || "The assistant could not answer right now.";
        if (err?.status === 409 && sessionId) {
          // The lecture was deleted: the chat can be read but no longer answers.
          setSessions((list) => list.map((item) => (item.id === sessionId ? { ...item, lecture: null } : item)));
        }
        if (activeRef.current === sessionId || activeRef.current === null) {
          setMessages((list) => [
            ...list.map((message) => (message.id === pendingId ? { ...message, pending: false } : message)),
            { id: crypto.randomUUID(), role: "system", content: message },
          ]);
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [sessions, putSession, select]
  );

  const rename = useCallback(
    async (id, title) => {
      putSession(await renameChatSession(id, title));
    },
    [putSession]
  );

  const remove = useCallback(
    async (id) => {
      await deleteChatSession(id);
      setSessions((list) => list.filter((item) => item.id !== id));
      if (activeRef.current === id) startNewChat();
    },
    [startNewChat]
  );

  const activeSession = sessions.find((item) => item.id === activeId) ?? null;

  return {
    sessions,
    sessionsLoading,
    sessionsError,
    reloadSessions: loadSessions,
    activeSession,
    messages,
    messagesLoading,
    busy,
    openSession,
    startNewChat,
    send,
    rename,
    remove,
  };
}
