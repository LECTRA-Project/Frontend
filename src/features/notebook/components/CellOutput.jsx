import { useEffect, useRef } from "react";

import { renderMarkdown, sanitizeHtml } from "../../../services/notebook/markdown.js";

// Richest representation first, like Jupyter.
const MIME_ORDER = ["image/png", "image/jpeg", "image/svg+xml", "text/html", "text/markdown", "text/latex", "text/plain"];

// Tracebacks from real Jupyter kernels contain ANSI colour codes.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;
const stripAnsi = (text) => text.replace(ANSI_PATTERN, "");

function RichData({ data }) {
  const mime = MIME_ORDER.find((type) => typeof data[type] === "string");
  if (!mime) return <pre className="nb-output__text">[output in an unsupported format: {Object.keys(data).join(", ")}]</pre>;
  const value = data[mime];

  if (mime === "image/png" || mime === "image/jpeg") {
    return <img className="nb-output__image" src={`data:${mime};base64,${value.trim()}`} alt={data["text/plain"] ?? "Output image"} />;
  }
  if (mime === "image/svg+xml" || mime === "text/html") {
    return <div className="nb-output__html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />;
  }
  if (mime === "text/markdown" || mime === "text/latex") {
    return <div className="nb-output__html markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />;
  }
  return <pre className="nb-output__text">{stripAnsi(value)}</pre>;
}

function ErrorOutput({ output }) {
  const lines = output.traceback.map(stripAnsi).join("\n").split("\n");
  // A Python traceback ends with "Name: message", which the heading already shows.
  const last = lines[lines.length - 1];
  if (last === output.ename || last?.startsWith(`${output.ename}: `)) lines.pop();
  const details = lines.join("\n").trim();

  return (
    <div className="nb-output__error">
      <p className="nb-output__error-title">
        <strong>{output.ename}</strong>
        {output.evalue && `: ${output.evalue}`}
      </p>
      {details && <pre className="nb-output__traceback">{details}</pre>}
    </div>
  );
}

/*
  The outputs of one code cell, in the order they were produced.
  While the cell runs, new output is scrolled into view.
*/
export default function CellOutput({ outputs, running }) {
  const endRef = useRef(null);

  useEffect(() => {
    if (running) endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [outputs, running]);

  if (outputs.length === 0) return null;

  return (
    <div className="nb-output" aria-live={running ? "polite" : undefined}>
      {outputs.map((output, index) => (
        <div key={index} className="nb-output__row">
          <span className="nb-output__prompt" aria-hidden="true">
            {output.output_type === "execute_result" && output.execution_count != null
              ? `Out[${output.execution_count}]:`
              : ""}
          </span>
          <div className="nb-output__content">
            {output.output_type === "stream" && (
              <pre className={`nb-output__text ${output.name === "stderr" ? "nb-output__text--stderr" : ""}`}>
                {stripAnsi(output.text)}
              </pre>
            )}
            {(output.output_type === "execute_result" || output.output_type === "display_data") && (
              <RichData data={output.data} />
            )}
            {output.output_type === "error" && <ErrorOutput output={output} />}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
