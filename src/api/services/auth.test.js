import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getCurrentUser, login, logout, register, requestPasswordReset, resetPassword } from "./auth.js";
import { ApiError, getAuthToken } from "../client.js";
import { mockApi, ok, TEST_USER } from "../../test/helpers.jsx";

describe("auth service", () => {
  let api;
  beforeEach(() => {
    api = mockApi();
  });
  afterEach(() => api.restore());

  it("register sends full_name and returns the new user", async () => {
    api.onPost("/auth/register").reply((config) => [201, ok({ ...TEST_USER, ...JSON.parse(config.data) })]);

    const user = await register({ email: TEST_USER.email, password: "secret123", fullName: "Ada Lovelace" });

    expect(JSON.parse(api.history.post[0].data)).toEqual({
      email: TEST_USER.email,
      password: "secret123",
      full_name: "Ada Lovelace",
    });
    expect(user.full_name).toBe("Ada Lovelace");
    expect(getAuthToken()).toBeNull(); // register doesn't sign in on its own
  });

  it("login saves the token", async () => {
    api.onPost("/auth/login").reply(200, ok({ token: "jwt-123" }, "Login successful"));

    const data = await login({ email: TEST_USER.email, password: "secret123" });

    expect(data.token).toBe("jwt-123");
    expect(getAuthToken()).toBe("jwt-123");
  });

  it("failed login saves nothing", async () => {
    api.onPost("/auth/login").reply(401, { detail: "Invalid email or password" });

    await expect(login({ email: TEST_USER.email, password: "nope" })).rejects.toThrow("Invalid email or password");
    expect(getAuthToken()).toBeNull();
  });

  it("requests a password reset and returns the server message", async () => {
    const message = "If an account with this email exists, a reset link has been sent";
    api.onPost("/auth/forgot-password").reply(200, ok(null, message));

    const response = await requestPasswordReset({ email: TEST_USER.email });

    expect(JSON.parse(api.history.post[0].data)).toEqual({ email: TEST_USER.email });
    expect(response.message).toBe(message);
  });

  it("rejects a password-reset response with a false status", async () => {
    api.onPost("/auth/forgot-password").reply(200, { status: false, message: "Reset unavailable" });

    await expect(requestPasswordReset({ email: TEST_USER.email })).rejects.toThrow(ApiError);
  });

  it("resets the password with the reset token", async () => {
    api.onPost("/auth/reset-password").reply(200, ok(null, "Password has been reset successfully"));

    const response = await resetPassword({ token: "reset-token", newPassword: "new-secret" });

    expect(JSON.parse(api.history.post[0].data)).toEqual({
      token: "reset-token",
      new_password: "new-secret",
    });
    expect(response.message).toBe("Password has been reset successfully");
  });

  it("rejects an invalid reset token response", async () => {
    api.onPost("/auth/reset-password").reply(400, { detail: "Invalid or expired reset token" });

    await expect(resetPassword({ token: "invalid-token", newPassword: "new-secret" })).rejects.toThrow(
      "Invalid or expired reset token"
    );
  });

  it("getCurrentUser sends the token and returns the user", async () => {
    api.onPost("/auth/login").reply(200, ok({ token: "jwt-123" }));
    api.onGet("/auth/user").reply((config) =>
      config.headers.Authorization === "Bearer jwt-123" ? [200, ok(TEST_USER)] : [403, { detail: "Not authenticated" }]
    );

    await login({ email: TEST_USER.email, password: "secret123" });
    expect(await getCurrentUser()).toEqual(TEST_USER);
  });

  it("logout removes the token", async () => {
    api.onPost("/auth/login").reply(200, ok({ token: "jwt-123" }));
    await login({ email: TEST_USER.email, password: "secret123" });

    logout();
    expect(getAuthToken()).toBeNull();
  });
});
