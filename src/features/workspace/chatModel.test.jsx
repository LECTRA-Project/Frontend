import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";

/*
  The model button beside the chat's message box: it only shows the current model; the
  dialog offers models only for providers with a usable saved key, lists the others as
  locked entries that open their key row in Account settings, the chosen model is sent
  with the question and kept for the next visit, and a failing own model shows its real
  error (no fallback to another model).
*/
const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 10 });
const LECTRA = { id: "lectra", provider: "lectra", model: null, name: "Lectra" };
const OPUS = { id: "anthropic:claude-opus-5-5", provider: "anthropic", model: "claude-opus-5-5", name: "Claude Opus 5.5" };
const MINI = { id: "openai:gpt-4o-mini", provider: "openai", model: "gpt-4o-mini", name: "gpt-4o-mini" };
const MODEL_KEY = `lectra:chat-model:v1:${TEST_USER.id}`;

let api;
let backend;

function setup(models) {
  backend = installChatBackend(api, {
    lectures: [KI02],
    sessions: [{ id: "s-1", title: "Decision trees", lectureIds: [KI02.id], updated_at: daysAgo(0) }],
    messages: { "s-1": [] },
    models,
  });
}

beforeEach(() => {
  localStorage.clear();
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const modelButton = () => screen.findByRole("button", { name: /^Model: / });

async function ask(user, text) {
  await user.type(screen.getByLabelText("Message to the study assistant"), text);
  await user.click(screen.getByRole("button", { name: "Send message" }));
}

describe("choosing the chat model", () => {
  it("without keys: only Lectra is selectable; a locked provider opens its key row and the chat comes back", async () => {
    setup();
    api.onGet("/users/me/api-keys").reply(200, ok({ api_keys: [] }));
    const user = userEvent.setup();
    const { router } = renderApp("/workspace?chat=s-1");
    await user.click(await modelButton());

    const dialog = screen.getByRole("dialog", { name: "Choose a model" });
    expect(within(dialog).getAllByRole("radio")).toHaveLength(1);
    expect(within(dialog).getByRole("radio", { name: /Lectra/ })).toBeChecked();
    // No key form or setup card in the dialog: providers are locked entries.
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    for (const name of ["Anthropic Claude", "Google Gemini", "OpenAI GPT"]) {
      expect(within(dialog).getByRole("link", { name: `Add a ${name} API key in Account settings` })).toBeInTheDocument();
    }

    await user.click(within(dialog).getByRole("link", { name: "Add a Google Gemini API key in Account settings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(router.state.location.hash).toBe("#api-key-gemini");
    // That provider's row, with its Add key button focused.
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a Google Gemini API key" })).toHaveFocus());

    // Back to the same chat, with the model dialog open again.
    await user.click(screen.getByRole("link", { name: "Back to the chat to choose a model" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(router.state.location.search).toBe("?chat=s-1");
    expect(await screen.findByRole("dialog", { name: "Choose a model" })).toBeInTheDocument();
  });

  it("offers only the providers with a key, sends the chosen model and keeps the choice", async () => {
    setup({
      default: "lectra",
      models: [LECTRA, OPUS, MINI],
      unavailable: [{ provider: "gemini", name: "Gemini", message: "Gemini is currently unavailable. Please try again later" }],
    });
    const user = userEvent.setup();
    const first = renderApp("/workspace?chat=s-1");
    await user.click(await modelButton());
    const dialog = screen.getByRole("dialog", { name: "Choose a model" });

    await waitFor(() => expect(within(dialog).getByRole("radio", { name: "Claude Opus 5.5" })).toBeInTheDocument());
    expect(within(dialog).getByRole("group", { name: "Anthropic Claude" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "OpenAI GPT" })).toBeInTheDocument();
    // Gemini's saved key failed: not selectable, named with the backend's message, links to its row.
    expect(within(dialog).queryByRole("group", { name: "Google Gemini" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Gemini is currently unavailable. Please try again later")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /^Google Gemini is unavailable/ })).toHaveAttribute("href", "/settings#api-key-gemini");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(3);

    await user.click(within(dialog).getByRole("radio", { name: "Claude Opus 5.5" }));
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Model: Claude Opus 5.5. Choose a model" })).toBeInTheDocument();
    // Only the choice is kept in the browser, never a key.
    expect(JSON.parse(localStorage.getItem(MODEL_KEY))).toEqual({ id: OPUS.id, name: "Claude Opus 5.5", provider: "anthropic" });

    await ask(user, "What is a split?");
    await waitFor(() => expect(backend.sent).toEqual([{ id: "s-1", content: "What is a split?", model: OPUS.id }]));

    // Restored on the next visit.
    first.unmount();
    renderApp("/workspace?chat=s-1");
    expect(await screen.findByRole("button", { name: "Model: Claude Opus 5.5. Choose a model" })).toBeInTheDocument();
  });

  it("sends no model with Lectra, as before", async () => {
    setup({ default: "lectra", models: [LECTRA, OPUS], unavailable: [] });
    const user = userEvent.setup();
    renderApp("/workspace?chat=s-1");
    await modelButton();
    await ask(user, "What is a split?");
    await waitFor(() => expect(backend.sent).toEqual([{ id: "s-1", content: "What is a split?" }]));
  });

  it("shows the own model's real error and does not ask another model", async () => {
    setup({ default: "lectra", models: [LECTRA, OPUS], unavailable: [] });
    localStorage.setItem(MODEL_KEY, JSON.stringify({ id: OPUS.id, name: OPUS.name, provider: "anthropic" }));
    let calls = 0;
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply(() => {
      calls += 1;
      return [429, { detail: "Your Claude API key has reached its rate or usage limit. Please try again later" }];
    });
    api.handlers.unshift(api.handlers.pop()); // checked before the fake backend's handler
    const user = userEvent.setup();
    renderApp("/workspace?chat=s-1");
    await modelButton();
    await ask(user, "What is a split?");
    expect(await screen.findByText("Your Claude API key has reached its rate or usage limit. Please try again later")).toBeInTheDocument();
    expect(calls).toBe(1);
    expect(backend.sent).toEqual([]);
  });

  it("keeps a chosen model that is no longer offered and says so", async () => {
    setup({ default: "lectra", models: [LECTRA], unavailable: [] });
    localStorage.setItem(MODEL_KEY, JSON.stringify({ id: OPUS.id, name: OPUS.name, provider: "anthropic" }));
    renderApp("/workspace?chat=s-1");
    expect(
      await screen.findByText(
        "Claude Opus 5.5 isn't available right now. Choose another model, or check your API key in Account settings."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model: Claude Opus 5.5. Choose a model" })).toBeInTheDocument();
  });
});

describe("the chat in German", () => {
  it("translates the interface but not the chat's content or model names", async () => {
    setup({ default: "lectra", models: [LECTRA, OPUS], unavailable: [] });
    localStorage.setItem(`lectra:language:v1:${TEST_USER.id}`, "de");
    backend.messages["s-1"] = [
      { id: "m1", session_id: "s-1", role: "user", content: "What is a split?", sources: null, created_at: daysAgo(0) },
      { id: "m2", session_id: "s-1", role: "assistant", content: "A split divides the records.", sources: [], created_at: daysAgo(0) },
    ];
    const user = userEvent.setup();
    renderApp("/workspace?chat=s-1");
    expect(await screen.findByText("A split divides the records.")).toBeInTheDocument();
    expect(screen.getByText("What is a split?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neuer Chat" })).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: /^Modell: / }));
    const dialog = screen.getByRole("dialog", { name: "Modell auswählen" });
    expect(within(dialog).getByRole("radio", { name: "Claude Opus 5.5" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "Anthropic Claude" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Fertig" })).toBeInTheDocument();
  });
});

describe("preferred model from Account settings", () => {
  it("is listed first for its provider and marked as preferred", async () => {
    const HAIKU = { id: "anthropic:claude-haiku-5-5", provider: "anthropic", model: "claude-haiku-5-5", name: "Claude Haiku 5.5" };
    setup({ default: "lectra", models: [LECTRA, OPUS, HAIKU], unavailable: [] });
    localStorage.setItem(`lectra:preferred-models:v1:${TEST_USER.id}`, JSON.stringify({ anthropic: HAIKU.id }));
    const user = userEvent.setup();
    renderApp("/workspace?chat=s-1");
    await user.click(await modelButton());
    const dialog = screen.getByRole("dialog", { name: "Choose a model" });
    const group = await within(dialog).findByRole("group", { name: "Anthropic Claude" });
    const radios = within(group).getAllByRole("radio");
    expect(radios[0]).toHaveAccessibleName(/Claude Haiku 5\.5.*Your preferred Anthropic Claude model/);
    expect(radios[1]).toHaveAccessibleName("Claude Opus 5.5");
  });
});
