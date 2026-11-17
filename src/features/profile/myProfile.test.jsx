import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

let api;
let token;

beforeEach(() => {
  api = mockApi();
  token = makeToken(1800);
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  saveToken(token);
});
afterEach(() => api.restore());

async function openProfile() {
  const utils = renderApp("/profile");
  await screen.findByRole("heading", { name: "My profile" });
  return utils;
}

describe("my profile", () => {
  it("does not cut off a long new password and shows the length error instead", async () => {
    const user = userEvent.setup();
    await openProfile();
    const longPassword = "VeryStrongPass123!x";

    await user.type(screen.getByLabelText("Current password"), "secret123");
    await user.type(screen.getByLabelText("New password"), longPassword);
    await user.type(screen.getByLabelText("Confirm new password"), longPassword);
    expect(screen.getByLabelText("New password")).toHaveValue(longPassword);
    expect(screen.getByLabelText("Confirm new password")).toHaveValue(longPassword);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("New password must be between 8 and 14 characters.")).toBeInTheDocument();
    expect(api.history.put).toHaveLength(0);
  });

  it("clears an earlier server error when a field is edited", async () => {
    api.onPut("/users/me/password").reply(400, { detail: "Current password is incorrect" });
    const user = userEvent.setup();
    await openProfile();

    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByLabelText("New password"), "StrongerPass1!");
    await user.type(screen.getByLabelText("Confirm new password"), "StrongerPass1!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");

    await user.type(screen.getByLabelText("Current password"), "x");
    expect(screen.queryByText("Current password is incorrect")).not.toBeInTheDocument();
  });

  it("leaves at once on Cancel when nothing was changed", async () => {
    const user = userEvent.setup();
    const { router } = await openProfile();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
  });

  it("asks before discarding unsaved changes on Cancel", async () => {
    const user = userEvent.setup();
    const { router } = await openProfile();
    const nameField = screen.getByLabelText("Full name");
    await user.clear(nameField);
    await user.type(nameField, "Grace Hopper");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    expect(dialog).toHaveTextContent("The changes you made to your profile will be lost.");

    // Keep editing: the dialog closes and the change is still there.
    await user.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/profile");
    expect(screen.getByLabelText("Full name")).toHaveValue("Grace Hopper");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(api.history.patch).toHaveLength(0);
  });

  it("is shown in German, validation messages included", async () => {
    localStorage.setItem(`lectra:language:v1:${TEST_USER.id}`, "de");
    const user = userEvent.setup();
    renderApp("/profile");

    expect(await screen.findByRole("heading", { name: "Mein Profil" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profildaten" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Passwort ändern" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("E-Mail"));
    await user.type(screen.getByLabelText("E-Mail"), "not-an-email");
    await user.type(screen.getByLabelText("Neues Passwort"), "short");
    expect(screen.getByRole("listitem", { name: "8–14 Zeichen: nicht erfüllt" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Änderungen speichern" }));

    expect(await screen.findByText("Bitte gib eine gültige E-Mail-Adresse ein.")).toBeInTheDocument();
    expect(screen.getByText("Neues Passwort muss zwischen 8 und 14 Zeichen lang sein.")).toBeInTheDocument();
    expect(screen.getByText("Gib dein aktuelles Passwort ein, um dein Passwort zu ändern.")).toBeInTheDocument();
  });
});
