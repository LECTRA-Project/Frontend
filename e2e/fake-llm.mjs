/*
  A fake LLM for the browser tests: an OpenAI-compatible POST /v1/chat/completions that
  answers every request of the backend with valid JSON, without any API key.

  Start the backend with LLM_PROVIDERS=ollama:mock (and LLM_VISION_PROVIDERS=ollama:mock):
  the backend's "ollama" provider needs no key and calls http://localhost:11434/v1, where
  this server listens (E2E_FAKE_LLM_PORT to move it; the backend's address is fixed).

  The backend puts the JSON schema it expects at the end of the system message. The answer
  is chosen by the schema's title:
    - Generated_multiple_choice / Generated_short_answer: a question about the slides in the
      prompt; multiple choice has choices a–d and "b" ("It is a core idea of …") is always
      right; the difficulty asked for ('Set "difficulty" to "hard"') is used. Like a real
      model must, the texts never mention slides, pages or the lecture (the backend checks).
    - TaskGradingResult: the first rubric criterion gets its points, the others 0.
    - _LLMAnswer (chat): an answer citing the first excerpt.
    - anything else: the smallest object that fits the schema.
  Every request is kept for GET /requests (the tests can look at what the backend sent).
*/
import http from "node:http";

const PORT = Number(process.env.E2E_FAKE_LLM_PORT || 11434);
const requests = [];

function schemaOf(system) {
  const match = /```json\s*([\s\S]*?)```\s*$/.exec(system ?? "");
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/* The smallest value that fits a JSON schema (pydantic's model_json_schema). */
function fill(schema, defs, name = "") {
  if (!schema) return null;
  if (schema.$ref) return fill(defs[schema.$ref.split("/").pop()], defs, name);
  if (schema.anyOf) return fill(schema.anyOf.find((option) => option.type !== "null") ?? schema.anyOf[0], defs, name);
  if ("const" in schema) return schema.const;
  if (schema.enum) return schema.enum[0];
  if ("default" in schema && schema.default !== null) return schema.default;
  switch (schema.type) {
    case "object": {
      const out = {};
      for (const [key, value] of Object.entries(schema.properties ?? {})) out[key] = fill(value, defs, key);
      return out;
    }
    case "array":
      return Array.from({ length: schema.minItems ?? 0 }, () => fill(schema.items, defs, name));
    case "integer":
    case "number":
      return schema.minimum ?? (schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + 1 : 0);
    case "boolean":
      return false;
    case "string": {
      const text = `Mock ${name || "text"}`;
      return text.padEnd(schema.minLength ?? 0, ".");
    }
    default:
      return null;
  }
}

/* The first line of the slides in a task prompt, to write a question about it. */
function topic(prompt) {
  const slides = /<slides>([\s\S]*?)<\/slides>/.exec(prompt)?.[1] ?? "";
  // The page markers ("[Page 1]", "[Slide 2]", "[Cell 3]") are skipped.
  const line = slides.split("\n").map((part) => part.trim()).find((part) => part && !/^\[?(page|slide|cell)\s+\d+\]?$/i.test(part));
  return (line ?? "the material").replace(/[#*_`]/g, "").slice(0, 80);
}

function task(type, prompt) {
  const subject = topic(prompt);
  const difficulty = /Set "difficulty" to "(easy|medium|hard)"/.exec(prompt)?.[1] ?? "medium";
  if (type === "multiple_choice") {
    return {
      type,
      question: `Which statement about “${subject}” is right?`,
      choices: [
        { id: "a", text: "It is never used in practice." },
        { id: "b", text: `It is a core idea of ${subject}.` },
        { id: "c", text: "It only works on images." },
        { id: "d", text: "It has no definition." },
      ],
      correct_choice_ids: ["b"],
      reference_solution: `${subject} is a core idea of the topic.`,
      rubric: [{ id: "c1", description: "Selects the right statement", points: 1 }],
      concepts: [subject.toLowerCase().slice(0, 40)],
      difficulty,
    };
  }
  return {
    type,
    question: `Explain “${subject}” in your own words.`,
    choices: null,
    correct_choice_ids: null,
    reference_solution: `${subject}, explained with an example.`,
    rubric: [
      { id: "c1", description: "Names the main idea", points: 2 },
      { id: "c2", description: "Gives an example", points: 1 },
    ],
    concepts: [subject.toLowerCase().slice(0, 40)],
    difficulty,
  };
}

function grading(prompt) {
  const criteria = [...prompt.matchAll(/^- (\S+) \(([\d.]+) points?\):/gm)].map((match) => ({ id: match[1], points: Number(match[2]) }));
  const scores = criteria.map((criterion, index) => ({
    criterion_id: criterion.id,
    points: index === 0 ? criterion.points : 0,
    justification: index === 0 ? "Names the main idea." : "Misses this part.",
  }));
  const total = scores.reduce((sum, score) => sum + score.points, 0);
  const maximum = criteria.reduce((sum, criterion) => sum + criterion.points, 0);
  const verdict = total === maximum ? "correct" : total > 0 ? "partially_correct" : "incorrect";
  return { scores, verdict, feedback: "Mock feedback: the main idea is there." };
}

function answerFor(system, prompt) {
  const schema = schemaOf(system);
  const title = schema?.title ?? "";
  const generic = fill(schema, schema?.$defs ?? {});
  if (title === "Generated_multiple_choice") return task("multiple_choice", prompt);
  if (title === "Generated_short_answer") return task("short_answer", prompt);
  if (title === "TaskGradingResult") return grading(prompt);
  if (title === "_LLMAnswer") {
    return { ...generic, question_language: "English", answer: "Mock answer: this is explained on the cited page.", from_lectures: true, sources: [1], suggestion: "" };
  }
  return generic ?? {};
}

function reply(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function handle(request, response) {
  if (request.method === "GET" && request.url === "/requests") return reply(response, 200, requests);
  if (request.method === "GET" && request.url === "/health") return reply(response, 200, { ok: true });
  if (request.method !== "POST" || !request.url.endsWith("/chat/completions")) return reply(response, 404, { error: "not found" });
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(response, 400, { error: "invalid JSON" });
    }
    const messages = body.messages ?? [];
    const text = (role) => {
      const content = messages.find((message) => message.role === role)?.content ?? "";
      return Array.isArray(content) ? content.filter((part) => part.type === "text").map((part) => part.text).join("") : content;
    };
    const system = text("system");
    const prompt = text("user");
    const content = JSON.stringify(answerFor(system, prompt));
    requests.push({ title: schemaOf(system)?.title ?? null, prompt: prompt.slice(0, 2000) });
    reply(response, 200, {
      id: `mock-${requests.length}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "mock",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
  });
}

// Both loopback addresses: the backend asks for "localhost", which may be either.
for (const host of ["127.0.0.1", "::1"]) {
  http
    .createServer(handle)
    .on("error", (error) => {
      if (host === "127.0.0.1") throw error;
    })
    .listen(PORT, host, () => console.log(`fake LLM listening on http://${host.includes(":") ? `[${host}]` : host}:${PORT}/v1`));
}
