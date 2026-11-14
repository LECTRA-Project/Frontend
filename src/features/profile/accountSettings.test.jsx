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

const row = (name) => screen.getByText(name, { selector: ".settings__label" }).closest(".settings__row");

describe("AI provider API keys", () => {
  it("shows which providers have a key, masked to its last 4 characters", async () => {
    renderApp("/settings");
    expect(await screen.findByRole("heading", { name: "AI provider API keys" })).toBeInTheDocument();
    await waitFor(() => expect(within(row("Anthropic Claude")).getByText("Key saved")).toBeInTheDocument());
    expect(within(row("Anthropic Claude")).getByText(/Ends in x9Qa/)).toBeInTheDocument();
    expect(within(row("Google Gemini")).getByText("No key saved")).toBeInTheDocument();
    expect(within(row("OpenAI GPT")).getByText("No key saved")).toBeInTheDocument();
    expect(within(row("Google Gemini")).getByRole("button", { name: "Add a Google Gemini API key" })).toBeInTheDocument();
  });

  it("adds a key: hidden by default, can be shown, checked by the server and then never shown again", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Add a Google Gemini API key" }));
    const input = screen.getByLabelText("Google Gemini API key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveFocus();
    await user.type(input, GEMINI_KEY);

    await user.click(screen.getByRole("button", { name: "Show the key" }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide the key" }));
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByText("Key saved. Google Gemini accepted it.")).toBeInTheDocument();
    expect(requests).toEqual([{ method: "put", provider: "gemini", key: GEMINI_KEY }]);

    // The form is gone and the key is nowhere on the page or in the browser's storage.
    expect(screen.queryByLabelText("Google Gemini API key")).not.toBeInTheDocument();
    expect(within(row("Google Gemini")).getByText(/Ends in abcd/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(GEMINI_KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(GEMINI_KEY);
  });

  it("shows the provider's rejection without the key, and keeps nothing", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Add a Google Gemini API key" }));
    await user.type(screen.getByLabelText("Google Gemini API key"), "bad-key-0000");
    await user.click(screen.getByRole("button", { name: "Save key" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The Gemini API key was rejected. Check that it is correct and active");
    expect(alert).not.toHaveTextContent("bad-key-0000");
    expect(within(row("Google Gemini")).getByText("No key saved")).toBeInTheDocument();
  });

  it("checks the input before sending it", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Add a Google Gemini API key" }));
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your API key first.");
    await user.type(screen.getByLabelText("Google Gemini API key"), "AIza with spaces");
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An API key has no spaces.");
    expect(requests).toEqual([]);
  });

  it("tests a saved key with the provider's real model list", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Test key" }));
    expect(await screen.findByText("The key works: Anthropic Claude offers 2 chat models with it.")).toBeInTheDocument();

    models = {
      ...models,
      models: [models.models[0]],
      unavailable: [{ provider: "anthropic", name: "Claude", message: "Your Claude API key was rejected. Check or replace it in your settings" }],
    };
    await user.click(screen.getByRole("button", { name: "Test key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your Claude API key was rejected");
  });

  it("replaces and removes a saved key (after asking)", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Replace the Anthropic Claude API key" }));
    await user.type(screen.getByLabelText("Anthropic Claude API key"), "sk-ant-NEWKEY-wxyz");
    await user.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByText("Key saved. Anthropic Claude accepted it.")).toBeInTheDocument();
    expect(within(row("Anthropic Claude")).getByText(/Ends in wxyz/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove the Anthropic Claude API key" }));
    const dialog = screen.getByRole("dialog", { name: "Remove the Anthropic Claude API key?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove key" }));
    expect(await screen.findByText("The key was removed. Its models are no longer offered in the chat.")).toBeInTheDocument();
    expect(within(row("Anthropic Claude")).getByText("No key saved")).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({ method: "delete", provider: "anthropic" });
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
    expect(screen.getByText("Anthropic Claude")).toBeInTheDocument();
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

describe("notifications and privacy", () => {
  it("keep their defaults and demo behaviour", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    expect(await screen.findByRole("switch", { name: "Study reminders" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Product updates" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Show statistics on my profile" })).toHaveAttribute("aria-checked", "false");

    await user.click(screen.getByRole("switch", { name: "Product updates" }));
    expect(screen.getByRole("switch", { name: "Product updates" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText("Demo mode — settings are not saved yet.")).toBeInTheDocument();
  });
});
