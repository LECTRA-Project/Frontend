import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { apiClient } from "../../api/client.js";
import { makeToken, mockApi, ok, renderApp, savedToken, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  End-to-end UI flows over the real routes, guards and AuthProvider,
  with the HTTP layer mocked to answer like the FastAPI backend.
*/

let api;
let token;

beforeEach(() => {
  api = mockApi();
  token = makeToken(1800);
});
afterEach(() => api.restore());

/* Backend behaviour shared by most tests. */
function backendWithUser({ password = "secret123" } = {}) {
  api.onPost("/auth/login").reply((config) => {
    const body = JSON.parse(config.data);
    return body.email === TEST_USER.email && body.password === password
      ? [200, ok({ token }, "Login successful")]
      : [401, { detail: "Invalid email or password" }];
  });
  api.onGet("/auth/user").reply((config) =>
    config.headers.Authorization === `Bearer ${token}` ? [200, ok(TEST_USER)] : [401, { detail: "Invalid or expired token" }]
  );
}

async function fillSignIn(user, email, password) {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

const openProfileMenu = (user) => user.click(screen.getByRole("button", { name: "Open profile menu" }));

describe("sign in", () => {
  it("opens the password reset page from the forgot-password link", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");

    await user.click(screen.getByRole("link", { name: "Forgot password?" }));

    expect(router.state.location.pathname).toBe("/forget-password");
    expect(await screen.findByRole("heading", { name: "Forgot your password?" })).toBeInTheDocument();
  });

  it("signs in and opens the workspace with the real user", async () => {
    backendWithUser();
    const user = userEvent.setup();
    const { router } = renderApp("/");

    await fillSignIn(user, TEST_USER.email, "secret123");

    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(savedToken()).toBe(token);
    expect(await screen.findByRole("button", { name: "Open profile menu" })).toHaveTextContent("AL");

    await openProfileMenu(user);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.email)).toBeInTheDocument();
  });

  it("shows the backend error for a wrong password and stays on sign-in", async () => {
    backendWithUser();
    const user = userEvent.setup();
    const { router } = renderApp("/");

    await fillSignIn(user, TEST_USER.email, "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(router.state.location.pathname).toBe("/");
    expect(savedToken()).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("checks empty fields without calling the backend", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Please enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Please enter your password.")).toBeInTheDocument();
    expect(api.history.post).toHaveLength(0);
  });

  it("shows a connection error when the backend is down", async () => {
    api.onPost("/auth/login").networkError();
    const user = userEvent.setup();
    renderApp("/");

    await fillSignIn(user, TEST_USER.email, "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });

  it("returns to the page the guest originally asked for", async () => {
    backendWithUser();
    const user = userEvent.setup();
    const { router } = renderApp("/statistics");

    // Guest is sent to sign-in first…
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await fillSignIn(user, TEST_USER.email, "secret123");

    // …and lands on /statistics afterwards.
    await waitFor(() => expect(router.state.location.pathname).toBe("/statistics"));
  });
});

describe("forgot password", () => {
  it("sends the email and displays the server confirmation", async () => {
    const message = "If an account with this email exists, a reset link has been sent";
    api.onPost("/auth/forgot-password").reply(200, ok(null, message));
    const user = userEvent.setup();
    renderApp("/forget-password");

    await user.type(screen.getByLabelText("Email"), TEST_USER.email);
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(JSON.parse(api.history.post[0].data)).toEqual({ email: TEST_USER.email });
    expect(await screen.findByRole("status")).toHaveTextContent(message);
  });

  it("validates the email before sending a reset request", async () => {
    const user = userEvent.setup();
    renderApp("/forget-password");

    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(screen.getByText("Please enter your email.")).toBeInTheDocument();
    expect(api.history.post).toHaveLength(0);
  });

  it("displays the API error if the reset request fails", async () => {
    api.onPost("/auth/forgot-password").reply(400, { message: "Reset request failed" });
    const user = userEvent.setup();
    renderApp("/forget-password");

    await user.type(screen.getByLabelText("Email"), TEST_USER.email);
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Reset request failed");
  });
});

describe("reset password", () => {
  it("resets the password and returns to sign in", async () => {
    api.onPost("/auth/reset-password").reply(200, ok(null, "Password has been reset successfully"));
    const user = userEvent.setup();
    const { router } = renderApp("/reset-password?token=reset-token");

    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(router.state.location.state).toEqual({ resetToken: "reset-token" });
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("New password"), "StrongerPass1!");
    await user.type(screen.getByLabelText("Confirm password"), "StrongerPass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(JSON.parse(api.history.post[0].data)).toEqual({
      token: "reset-token",
      new_password: "StrongerPass1!",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your password has been reset. Please sign in with your new password."
    );
  });

  it("validates matching passwords before sending a reset request", async () => {
    const user = userEvent.setup();
    renderApp("/reset-password?token=reset-token");

    await user.type(screen.getByLabelText("New password"), "StrongerPass1!");
    await user.type(screen.getByLabelText("Confirm password"), "different-secret");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByText("The passwords don’t match.")).toBeInTheDocument();
    expect(api.history.post).toHaveLength(0);
  });

  it("requires a strong password when resetting", async () => {
    const user = userEvent.setup();
    renderApp("/reset-password?token=reset-token");

    await user.type(screen.getByLabelText("New password"), "weak");
    await user.type(screen.getByLabelText("Confirm password"), "weak");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(screen.getByText("Password must be between 8 and 14 characters.")).toBeInTheDocument();
    expect(api.history.post).toHaveLength(0);
  });

  it("shows a reset request error for an invalid token", async () => {
    api.onPost("/auth/reset-password").reply(400, { detail: "Invalid or expired reset token" });
    const user = userEvent.setup();
    renderApp("/reset-password?token=invalid-token");

    await user.type(screen.getByLabelText("New password"), "StrongerPass1!");
    await user.type(screen.getByLabelText("Confirm password"), "StrongerPass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid or expired reset token");
  });

  it("does not submit when the reset token is missing", async () => {
    const user = userEvent.setup();
    renderApp("/reset-password");

    expect(screen.getByRole("button", { name: "Reset password" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forget-password");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(api.history.post).toHaveLength(0);
  });

  it("keeps the emailed reset route available for authenticated users", async () => {
    api.onGet("/auth/user").reply(200, ok(TEST_USER));
    saveToken(token);
    const { router } = renderApp("/reset-password?token=reset-token");

    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/reset-password");
  });
});

describe("create account", () => {
  async function fillRegister(
    user,
    { fullName = "Ada Lovelace", email = TEST_USER.email, password = "StrongerPass1!", confirm = password } = {}
  ) {
    await user.type(screen.getByLabelText("Full name"), fullName);
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), password);
    await user.type(screen.getByLabelText("Confirm password"), confirm);
    await user.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("registers, signs in automatically and opens the workspace", async () => {
    backendWithUser({ password: "StrongerPass1!" });
    api.onPost("/auth/register").reply(201, ok(TEST_USER, "User registered successfully"));
    const user = userEvent.setup();
    const { router } = renderApp("/create-account");

    await fillRegister(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(JSON.parse(api.history.post[0].data)).toEqual({
      email: TEST_USER.email,
      password: "StrongerPass1!",
      full_name: "Ada Lovelace",
    });
    expect(api.history.post[1].url).toBe("/auth/login");
    expect(savedToken()).toBe(token);
  });

  it("shows the backend error when the email is already taken", async () => {
    api.onPost("/auth/register").reply(409, { detail: "A user with this email already exists" });
    const user = userEvent.setup();
    const { router } = renderApp("/create-account");

    await fillRegister(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("A user with this email already exists");
    expect(router.state.location.pathname).toBe("/create-account");
    expect(api.history.post).toHaveLength(1); // no login attempt
  });

  it("puts backend validation errors under the right field", async () => {
    api.onPost("/auth/register").reply(422, {
      detail: [{ type: "missing", loc: ["body", "full_name"], msg: "Field required" }],
    });
    const user = userEvent.setup();
    renderApp("/create-account");

    await fillRegister(user);

    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText("Field required").length).toBeGreaterThan(0);
  });

  it("validates the form before calling the backend", async () => {
    const user = userEvent.setup();
    renderApp("/create-account");

    await fillRegister(user, { email: "not-an-email", confirm: "different" });

    expect(screen.getByText("Please enter a valid email.")).toBeInTheDocument();
    expect(screen.getByText("The passwords don’t match.")).toBeInTheDocument();
    expect(api.history.post).toHaveLength(0);
  });

  it("requires a strong password when creating an account", async () => {
    const user = userEvent.setup();
    renderApp("/create-account");

    await fillRegister(user, { password: "weak", confirm: "weak" });

    expect(screen.getByText("Password must be between 8 and 14 characters.")).toBeInTheDocument();
    expect(api.history.post).toHaveLength(0);
  });

  it("shows password requirements only after typing and updates them live", async () => {
    const user = userEvent.setup();
    renderApp("/create-account");

    expect(screen.queryByRole("list", { name: "Password requirements" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Password"), "a");

    expect(screen.getByRole("list", { name: "Password requirements" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "A lowercase letter: met" })).toHaveClass(
      "password-requirements__item--met"
    );
    expect(screen.getByRole("listitem", { name: "An uppercase letter: not met" })).not.toHaveClass(
      "password-requirements__item--met"
    );
    expect(screen.getByRole("listitem", { name: "8–14 characters: not met" }).querySelector("svg")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Password"), "BC12345!");

    for (const requirement of [
      "8–14 characters",
      "An uppercase letter",
      "A lowercase letter",
      "A number",
      "A special character",
    ]) {
      expect(screen.getByRole("listitem", { name: `${requirement}: met` })).toHaveClass(
        "password-requirements__item--met"
      );
    }
  });

  it("sends the user to sign-in if the automatic sign-in fails", async () => {
    api.onPost("/auth/register").reply(201, ok(TEST_USER));
    api.onPost("/auth/login").networkError();
    const user = userEvent.setup();
    const { router } = renderApp("/create-account");

    await fillRegister(user);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(savedToken()).toBeNull();
  });
});

describe("profile form validation", () => {
  it("validates optional profile email when provided", async () => {
    backendWithUser();
    saveToken(token);
    const user = userEvent.setup();
    renderApp("/profile");

    await screen.findByRole("heading", { name: "My profile" });
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Please enter a valid email.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("requires complete password-change details and a sufficiently long new password", async () => {
    backendWithUser();
    saveToken(token);
    const user = userEvent.setup();
    renderApp("/profile");

    await screen.findByRole("heading", { name: "My profile" });
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "short");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("New password must be between 8 and 14 characters.")).toBeInTheDocument();
    expect(screen.getByText("To change your password, enter your current password.")).toBeInTheDocument();
  });
});

describe("session", () => {
  it("restores a saved session on reload and skips the sign-in page", async () => {
    backendWithUser();
    saveToken(token);
    const { router } = renderApp("/");

    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(screen.getByRole("button", { name: "Open profile menu" })).toHaveTextContent("AL");
  });

  it("keeps guests out of every protected page", async () => {
    for (const path of ["/workspace", "/workspace/exam", "/profile", "/settings", "/statistics"]) {
      const { router, unmount } = renderApp(path);
      expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/");
      unmount();
    }
    expect(api.history.get).toHaveLength(0);
  });

  it("drops an expired saved token without calling the backend", async () => {
    saveToken(makeToken(-60));
    renderApp("/workspace");

    expect(await screen.findByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
    expect(savedToken()).toBeNull();
    expect(api.history.get).toHaveLength(0);
  });

  it("signs out when the backend rejects the saved token", async () => {
    backendWithUser();
    saveToken(makeToken(900)); // valid-looking, but not the token the backend issued
    renderApp("/workspace");

    expect(await screen.findByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
    expect(savedToken()).toBeNull();
  });

  it("signs out when any later request comes back 401", async () => {
    backendWithUser();
    api.onGet("/materials").reply(401, { detail: "Invalid or expired token" });
    saveToken(token);
    const { router } = renderApp("/workspace");
    await screen.findByRole("button", { name: "Open profile menu" });

    await act(() => apiClient.get("/materials").catch(() => {}));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.getByText("Your session has expired. Please sign in again.")).toBeInTheDocument();
  });

  it("signs out when another tab signs out", async () => {
    backendWithUser();
    saveToken(token);
    const { router } = renderApp("/workspace");
    await screen.findByRole("button", { name: "Open profile menu" });

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: "lectra.authToken", newValue: null }));
    });

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("sign out from the profile menu ends the session", async () => {
    backendWithUser();
    saveToken(token);
    const user = userEvent.setup();
    const { router } = renderApp("/workspace");
    await screen.findByRole("button", { name: "Open profile menu" });

    await openProfileMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(savedToken()).toBeNull();
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument();

    // The workspace is closed again.
    await act(() => router.navigate("/workspace"));
    expect(router.state.location.pathname).toBe("/");
  });

  it("profile pages still open for a signed-in user", async () => {
    backendWithUser();
    saveToken(token);
    const user = userEvent.setup();
    const { router } = renderApp("/workspace");
    await screen.findByRole("button", { name: "Open profile menu" });

    for (const [label, path, heading] of [
      ["My profile", "/profile", "My profile"],
      ["Account settings", "/settings", "Account settings"],
      ["Statistics", "/statistics", "Statistics"],
    ]) {
      await openProfileMenu(user);
      await user.click(screen.getByRole("menuitem", { name: label }));
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
      if (path === "/profile") expect(screen.getByText(TEST_USER.email)).toBeInTheDocument();
    }
  });
});
