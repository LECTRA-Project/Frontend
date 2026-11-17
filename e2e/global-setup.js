/* Before the browser tests: the backend must be up (and, in the mocked mode, the fake LLM). */
import { BACKEND } from "./support/backend.js";

export default async function globalSetup() {
  const health = await fetch(`${BACKEND}/api/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `No backend at ${BACKEND}. Start it first (see INSTRUCTIONS.md → Browser tests), ` +
        "in the mocked mode with LLM_PROVIDERS=ollama:mock LLM_VISION_PROVIDERS=ollama:mock."
    );
  }
}
