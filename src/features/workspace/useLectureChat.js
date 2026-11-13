import { useCallback, useEffect, useRef, useState } from "react";

import {
  attachChatLecture,
  createChatSession,
  deleteChatSession,
  detachChatLecture,
  listAllChatMessages,
  listAllChatSessions,
  renameChatSession,
  sendChatMessage,
} from "../../api/services/chat.js";

/*
  Saved chats (the Lecture Chat API) for the chat-first workspace. Every chat owns its
  materials (session.lectures) and answers from all of them.

  - Loads the student's chat sessions once `enabled` (most recently active first).
  - openSession(id) loads that chat's messages; startNewChat() shows an empty new chat.
    A new chat has no session until it needs one: the first question or the first
    material creates it.
  - attachLectures(sessionId | null, ids) adds materials to a chat (null: the new chat,
    which is created with them); detachLecture removes one from a chat.
  - updateLecture / forgetLecture keep the chats' materials in step after a lecture is
    renamed or deleted from the library.
  - createChat(ids, title) creates a chat with those materials (none is fine) without
    opening it; askIn(id, payload) opens a chat (loading its messages) and sends there.
  - send() shows the question at once, then replaces it with the saved question and the
    answer. The backend saves nothing when answering fails, so a failed question stays
    visible with the error and can simply be asked again.

  Messages in state: { id, role: "user" | "assistant" | "system", content, sources, extras }
  (extras: what the student added — notebook cell labels, shown under the question).
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

const NEW = "new-chat";

export function useLectureChat({ enabled }) {
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  // Chats waiting for an answer (session ids; NEW for a new chat not created yet).
  const [pending, setPending] = useState(() => new Set());
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

  /* Adds lectures to a chat; `sessionId` null creates the new chat with them. Returns the session. */
  const attachLectures = useCallback(
    async (sessionId, lectureIds) => {
      if (lectureIds.length === 0) return null;
      if (!sessionId) {
        const created = await createChatSession({ lectureIds });
        putSession(created, { toTop: true });
        // Still on the new chat: it now is this session.
        if (activeRef.current === null) select(created.id);
        return created;
      }
      let session = null;
      for (const lectureId of lectureIds) {
        session = await attachChatLecture(sessionId, lectureId);
        putSession(session);
      }
      return session;
    },
    [putSession, select]
  );

  const detachLecture = useCallback(
    async (sessionId, lectureId) => {
      const session = await detachChatLecture(sessionId, lectureId);
      putSession(session);
      return session;
    },
    [putSession]
  );

  /*
    Asks `content` in the open chat (a new chat is created first). `question` is what the
    student typed (shown in the list); `content` is what is sent (it may carry notebook
    context). Resolves true once answered, false on failure (the error is shown in the chat).
  */
  const send = useCallback(
    async ({ question, content, extras = [] }) => {
      const pendingId = crypto.randomUUID();
      let sessionId = activeRef.current;
      let key = sessionId ?? NEW;
      const mark = (from, to) =>
        setPending((current) => {
          const next = new Set(current);
          next.delete(from);
          if (to) next.add(to);
          return next;
        });
      setMessages((list) => [...list, { id: pendingId, role: "user", content: question, extras, pending: true }]);
      mark(null, key);
      try {
        if (!sessionId) {
          const created = await createChatSession({ lectureIds: [] });
          sessionId = created.id;
          putSession(created, { toTop: true });
          mark(key, sessionId);
          key = sessionId;
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
        if (activeRef.current === sessionId || activeRef.current === null) {
          setMessages((list) => [
            ...list.map((item) => (item.id === pendingId ? { ...item, pending: false } : item)),
            { id: crypto.randomUUID(), role: "system", content: message },
          ]);
        }
        return false;
      } finally {
        mark(key, null);
      }
    },
    [putSession, select]
  );

  /* A new chat with these lectures (and a title), listed first but not opened. */
  const createChat = useCallback(
    async (lectureIds, title) => {
      const created = await createChatSession({ lectureIds, title });
      putSession(created, { toTop: true });
      return created;
    },
    [putSession]
  );

  /*
    Opens chat `sessionId` (unless it is open already) and asks there, once its messages are
    loaded, so the question isn't replaced by the loaded list. Resolves like send(); false
    without sending if the student opened another chat meanwhile.
  */
  const askIn = useCallback(
    async (sessionId, payload) => {
      if (activeRef.current !== sessionId) await openSession(sessionId);
      if (activeRef.current !== sessionId) return false;
      return send(payload);
    },
    [openSession, send]
  );

  /* A lecture was renamed: show the new title in every chat that has it. */
  const updateLecture = useCallback((lecture) => {
    const swap = (list) => list.map((item) => (item.id === lecture.id ? { ...item, ...lecture } : item));
    setSessions((list) =>
      list.map((session) => {
        if (!session.lectures?.some((item) => item.id === lecture.id)) return session;
        const lectures = swap(session.lectures);
        return { ...session, lectures, lecture: lectures[0] ?? null };
      })
    );
  }, []);

  /* A lecture was deleted from the library: the backend drops it from every chat too. */
  const forgetLecture = useCallback((lectureId) => {
    setSessions((list) =>
      list.map((session) => {
        if (!session.lectures?.some((item) => item.id === lectureId)) return session;
        const lectures = session.lectures.filter((item) => item.id !== lectureId);
        return { ...session, lectures, lecture: lectures[0] ?? null };
      })
    );
  }, []);

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
  // Only the chat on screen shows that it is waiting for an answer.
  const busy = pending.has(activeId ?? NEW);

  return {
    sessions,
    sessionsLoading,
    sessionsError,
    reloadSessions: loadSessions,
    activeId,
    activeSession,
    messages,
    messagesLoading,
    busy,
    openSession,
    startNewChat,
    attachLectures,
    detachLecture,
    send,
    createChat,
    askIn,
    rename,
    remove,
    updateLecture,
    forgetLecture,
  };
}
