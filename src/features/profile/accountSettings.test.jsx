import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  Account settings: the student's own AI provider API keys (saved on the server, never
  shown again in full), the interface language (English / Deutsch, kept per user), and
  the demo notification / privacy toggles, which keep their behaviour.
*/
const GEMINI_KEY = "AIzaSyTESTKEY-1234567890abcd";

let api;
let keys;
let models;
let requests;

beforeEach(() => {
  localStorage.clear();
  api = mockApi();
  saveToken(makeToken(1800));
  requests = [];
  keys = [
    { provider: "anthropic", name: "Claude", key_last4: "x9Qa", created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-02T10:00:00Z" },
  ];
  models = {
    default: "lectra",
    models: [
      { id: "lectra", provider: "lectra", model: null, name: "Lectra" },
      { id: "anthropic:claude-opus-5-5", provider: "anthropic", model: "claude-opus-5-5", name: "Claude Opus 5.5" },
      { id: "anthropic:claude-haiku-5-5", provider: "anthropic", model: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
    ],
    unavailable: [],
  };
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/users/me/api-keys").reply(() => [200, ok({ api_keys: keys })]);
  api.onGet("/users/me/models").reply(() => [200, ok(models)]);
  api.onPut(/\/users\/me\/api-keys\/\w+$/).reply((config) => {
    const provider = config.url.split("/").pop();
    const { api_key: key } = JSON.parse(config.data);
    requests.push({ method: "put", provider, key });
    if (key.startsWith("bad")) {
      return [422, { detail: "The Gemini API key was rejected. Check that it is correct and active" }];
    }
    const saved = { provider, name: "Gemini", key_last4: key.slice(-4), created_at: "2026-11-14T09:00:00Z", updated_at: "2026-11-14T09:00:00Z" };
    keys = [...keys.filter((item) => item.provider !== provider), saved];
    return [200, ok(saved, "API key saved")];
  });
  api.onDelete(/\/users\/me\/api-keys\/\w+$/).reply((config) => {
    const provider = config.url.split("/").pop();
    requests.push({ method: "delete", provider });
    keys = keys.filter((item) => item.provider !== provider);
    return [200, ok({ provider })];
  });
});

afterEach(() => api.restore());

const CHAT_KEY = `lectra:chat-model:v1:${TEST_USER.id}`;
const dropdown = () => screen.getByRole("combobox", { name: "Add model" });
const groupsOf = (select) =>
  [...select.querySelectorAll("optgroup")].map((group) => [group.label, [...group.querySelectorAll("option")].map((option) => option.textContent)]);
const groupOf = (name) => groupsOf(dropdown()).find(([label]) => label === name)?.[1];
const ready = () => waitFor(() => expect(groupOf("Anthropic Claude")).toContain("Claude Opus 5.5"));

describe("AI provider API keys (one Add model dropdown)", () => {
  it("is the only model and key control: no separate provider rows or buttons", async () => {
    renderApp("/settings");
    await screen.findByRole("combobox", { name: "Add model" });
    await ready();
    expect(screen.getAllByRole("combobox").map((select) => select.labels[0]?.textContent)).toEqual(["Interface language", "Add model"]);
    expect(screen.queryByRole("button", { name: /Add key|Replace|Remove|Test key/ })).not.toBeInTheDocument();
    expect(screen.queryByText("No key saved")).not.toBeInTheDocument();
    expect(groupsOf(dropdown())).toEqual([
      ["LECTRA", ["Lectra (default)"]],
      ["Anthropic Claude", ["Claude Opus 5.5", "Claude Haiku 5.5", "Replace Anthropic Claude key (ends in x9Qa)…", "Remove Anthropic Claude key…"]],
      ["Google Gemini", ["Add API key for Google Gemini…"]],
      ["OpenAI GPT", ["Add API key for OpenAI GPT…"]],
    ]);
    expect(dropdown()).toHaveValue("lectra");
    expect(screen.getByText("Chat model: Lectra · LECTRA's own models")).toBeInTheDocument();
    // The other settings stay.
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
  });

  it("adds a key from the dropdown: masked, checked by the server, never shown again, then its models", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await screen.findByRole("combobox", { name: "Add model" });
    await ready();
    await user.selectOptions(dropdown(), "add:gemini");

    const input = screen.getByLabelText("Google Gemini API key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveFocus();
    expect(dropdown()).toHaveValue("lectra");
    await user.type(input, GEMINI_KEY);
    await user.click(screen.getByRole("button", { name: "Show the key" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide the key" }));

    models = { ...models, models: [...models.models, { id: "gemini:gemini-2.5-pro", provider: "gemini", model: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }] };
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByText("Key saved. Google Gemini accepted it.")).toBeInTheDocument();
    expect(requests).toEqual([{ method: "put", provider: "gemini", key: GEMINI_KEY }]);
    expect(screen.queryByLabelText("Google Gemini API key")).not.toBeInTheDocument();

    await waitFor(() => expect(groupOf("Google Gemini")).toEqual(["Gemini 2.5 Pro", "Replace Google Gemini key (ends in abcd)…", "Remove Google Gemini key…"]));
    expect(dropdown()).toHaveFocus();
    await user.selectOptions(dropdown(), "gemini:gemini-2.5-pro");
    expect(screen.getByText("Chat model: Gemini 2.5 Pro · Google Gemini")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CHAT_KEY))).toEqual({ id: "gemini:gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" });
    expect(document.body.innerHTML).not.toContain(GEMINI_KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(GEMINI_KEY);
  });

  it("shows the provider's rejection without the key, and keeps nothing", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await screen.findByRole("combobox", { name: "Add model" });
    await user.selectOptions(dropdown(), "add:gemini");
    await user.type(screen.getByLabelText("Google Gemini API key"), "bad-key-0000");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The Gemini API key was rejected. Check that it is correct and active");
    expect(alert).not.toHaveTextContent("bad-key-0000");
    expect(groupOf("Google Gemini")).toEqual(["Add API key for Google Gemini…"]);
  });

  it("checks the input before sending it, and Cancel closes the form", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await screen.findByRole("combobox", { name: "Add model" });
    await user.selectOptions(dropdown(), "add:openai");
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your API key first.");
    await user.type(screen.getByLabelText("OpenAI GPT API key"), "sk with spaces");
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An API key has no spaces.");
    expect(requests).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("OpenAI GPT API key")).not.toBeInTheDocument();
  });

  it("replaces and removes a saved key from the dropdown (after asking)", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await screen.findByRole("combobox", { name: "Add model" });
    await ready();
    await user.selectOptions(dropdown(), "replace:anthropic");
    expect(screen.getByText("Replaces the saved key ending in x9Qa.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Anthropic Claude API key"), "sk-ant-NEWKEY-wxyz");
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByText("Key saved. Anthropic Claude accepted it.")).toBeInTheDocument();
    await waitFor(() => expect(groupOf("Anthropic Claude")).toContain("Replace Anthropic Claude key (ends in wxyz)…"));

    await user.selectOptions(dropdown(), "remove:anthropic");
    const dialog = screen.getByRole("dialog", { name: "Remove the Anthropic Claude API key?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove key" }));
    expect(await screen.findByText("The Anthropic Claude key was removed. Its models are no longer offered in the chat.")).toBeInTheDocument();
    expect(groupOf("Anthropic Claude")).toEqual(["Add API key for Anthropic Claude…"]);
    expect(requests.at(-1)).toEqual({ method: "delete", provider: "anthropic" });
  });

  it("does not offer models for a rejected key, and lets it be replaced", async () => {
    const user = userEvent.setup();
    models = {
      ...models,
      models: [models.models[0]],
      unavailable: [{ provider: "anthropic", name: "Claude", message: "Your Claude API key was rejected. Check or replace it in your settings" }],
    };
    renderApp("/settings");
    expect(await screen.findByText(/Anthropic Claude: Your Claude API key was rejected/)).toBeInTheDocument();
    expect(groupOf("Anthropic Claude")).toEqual(["Key not working", "Replace Anthropic Claude key (ends in x9Qa)…", "Remove Anthropic Claude key…"]);
    await user.selectOptions(dropdown(), "replace:anthropic");
    expect(screen.getByLabelText("Anthropic Claude API key")).toHaveFocus();
  });

  it("shows loading, then a failure that can be retried without entering the key again", async () => {
    const user = userEvent.setup();
    let fail = true;
    api.onGet("/users/me/models").reply(() => (fail ? [503, { detail: "The models could not be loaded right now" }] : [200, ok(models)]));
    renderApp("/settings");
    expect(await screen.findByText("The models could not be loaded right now")).toBeInTheDocument();
    expect(groupOf("Anthropic Claude")[0]).toBe("Models not loaded");

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(requests).toEqual([]);
  });

  it("asks for another model when the chosen model's key is removed, and does not switch by itself", async () => {
    const user = userEvent.setup();
    localStorage.setItem(CHAT_KEY, JSON.stringify({ id: "anthropic:claude-opus-5-5", name: "Claude Opus 5.5", provider: "anthropic" }));
    renderApp("/settings");
    await waitFor(() => expect(dropdown()).toHaveValue("anthropic:claude-opus-5-5"));
    expect(screen.getByText("Chat model: Claude Opus 5.5 · Anthropic Claude")).toBeInTheDocument();
    await user.selectOptions(dropdown(), "remove:anthropic");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove key" }));

    expect(await screen.findByText("Claude Opus 5.5 can't be used any more. Choose another model.")).toBeInTheDocument();
    expect(within(dropdown()).getByRole("option", { name: "Claude Opus 5.5 (not available)" })).toBeDisabled();
    expect(JSON.parse(localStorage.getItem(CHAT_KEY)).id).toBe("anthropic:claude-opus-5-5");
  });
});

describe("interface language", () => {
  it("switches the interface to German and back, kept per user across visits", async () => {
    const user = userEvent.setup();
    const first = renderApp("/settings");
    await user.selectOptions(await screen.findByLabelText("Interface language"), "de");

    expect(await screen.findByRole("heading", { level: 1, name: "Kontoeinstellungen" })).toBeInTheDocument();
    expect(screen.getByText("Lernerinnerungen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zurück zum Arbeitsbereich/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("de");
    // Provider names are not translated.
    await waitFor(() => expect(document.querySelector('optgroup[label="Anthropic Claude"]')).not.toBeNull());
    expect(localStorage.getItem(`lectra:language:v1:${TEST_USER.id}`)).toBe("de");

    // The next visit starts in German.
    first.unmount();
    renderApp("/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Kontoeinstellungen" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sprache der Oberfläche")).toHaveValue("de");

    await user.selectOptions(screen.getByLabelText("Sprache der Oberfläche"), "en");
    expect(await screen.findByRole("heading", { level: 1, name: "Account settings" })).toBeInTheDocument();
  });
});

describe("notifications", () => {
  it("keeps study reminders with their demo behaviour; product updates and the privacy setting are gone", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    expect(await screen.findByRole("switch", { name: "Study reminders" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByText("Product updates")).not.toBeInTheDocument();
    expect(screen.queryByText("Show statistics on my profile")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Privacy" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Study reminders" }));
    expect(screen.getByRole("switch", { name: "Study reminders" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText("Demo mode — settings are not saved yet.")).toBeInTheDocument();
  });
});
