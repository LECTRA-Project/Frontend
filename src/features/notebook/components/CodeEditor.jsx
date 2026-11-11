import { useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  closeCompletion,
  completionKeymap,
  completionStatus,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, Prec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/* Syntax colours, defined as tokens in tokens.css. */
const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--code-number)" },
  { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--code-function)" },
  { tag: [tags.definition(tags.variableName), tags.className], color: "var(--code-definition)" },
  { tag: tags.self, color: "var(--code-keyword)" },
  { tag: tags.heading, fontWeight: "600", color: "var(--code-keyword)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: [tags.link, tags.url], color: "var(--code-function)" },
  { tag: tags.monospace, color: "var(--code-string)" },
]);

/*
  CodeEditor — CodeMirror 6 editor used by notebook cells.

  Props:
    value        text of the cell (the editor follows it if it changes from outside)
    language     "python" | "markdown" | "text"
    ariaLabel    accessible name of the editor
    placeholderText  hint shown while empty
    viewRef      receives the CodeMirror EditorView (used to focus the editor)
    onChange(text), onFocus()
    onRun()            Ctrl+Enter or Cmd+Enter
    onRunAndAdvance()  Shift+Enter
    onEscape()         Escape (leaves the editor; an open autocomplete list closes first)
*/
export default function CodeEditor({ value, language, ariaLabel, placeholderText, viewRef, ...handlers }) {
  const hostRef = useRef(null);
  const viewInstanceRef = useRef(null);
  const syncingRef = useRef(false); // true while applying a value that came from outside
  // The editor is created once; it always calls the latest handlers through this ref.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const call = (name) => () => {
      handlersRef.current[name]?.();
      return true;
    };

    const languageExtensions =
      language === "python"
        ? [python(), lineNumbers(), indentUnit.of("    "), EditorState.tabSize.of(4)]
        : [language === "markdown" ? markdown() : [], EditorView.lineWrapping];

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          // Escape closes a visible suggestion list first; otherwise it leaves the editor.
          Prec.highest(
            keymap.of([
              {
                key: "Escape",
                run: (editorView) => {
                  if (completionStatus(editorView.state) === "active") return false;
                  closeCompletion(editorView);
                  handlersRef.current.onEscape?.();
                  return true;
                },
              },
            ])
          ),
          Prec.high(
            keymap.of([
              { key: "Shift-Enter", run: call("onRunAndAdvance") },
              { key: "Mod-Enter", run: call("onRun") },
              { key: "Ctrl-Enter", run: call("onRun") }, // also Ctrl on macOS, where Mod is ⌘
            ])
          ),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          syntaxHighlighting(highlightStyle),
          placeholder(placeholderText ?? ""),
          languageExtensions,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingRef.current) handlersRef.current.onChange?.(update.state.doc.toString());
            if (update.focusChanged && update.view.hasFocus) handlersRef.current.onFocus?.();
          }),
        ],
      }),
    });
    viewInstanceRef.current = view;
    if (viewRef) viewRef.current = view;

    return () => {
      view.destroy();
      viewInstanceRef.current = null;
      if (viewRef) viewRef.current = null;
    };
    // The editor is rebuilt only when the language changes; value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Follow changes made outside the editor (opening a file, converting a cell, …).
  useEffect(() => {
    const view = viewInstanceRef.current;
    if (view && view.state.doc.toString() !== value) {
      syncingRef.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      syncingRef.current = false;
    }
  }, [value]);

  return <div ref={hostRef} className={`code-editor code-editor--${language}`} />;
}
