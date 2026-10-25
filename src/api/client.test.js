import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient, ApiError, AUTH_EXPIRED_EVENT, getAuthToken, getTokenExpiry, isTokenExpired, setAuthToken } from "./client.js";
import { makeToken, mockApi } from "../test/helpers.jsx";

describe("apiClient", () => {
  let api;
  beforeEach(() => {
    api = mockApi();
  });
  afterEach(() => api.restore());

  it("sends the saved token as a bearer header", async () => {
    setAuthToken("abc");
    api.onGet("/ping").reply((config) => [200, { auth: config.headers.Authorization }]);

    const response = await apiClient.get("/ping");
    expect(response.data.auth).toBe("Bearer abc");
  });

  it("sends no Authorization header without a token", async () => {
    api.onGet("/ping").reply((config) => [200, { auth: config.headers.Authorization ?? null }]);

    const response = await apiClient.get("/ping");
    expect(response.data.auth).toBeNull();
  });

  it("turns a FastAPI { detail: string } error into an ApiError", async () => {
    api.onPost("/auth/register").reply(409, { detail: "A user with this email already exists" });

    const error = await apiClient.post("/auth/register", {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe("A user with this email already exists");
  });

  it("maps 422 validation errors onto field names", async () => {
    api.onPost("/auth/register").reply(422, {
      detail: [{ type: "missing", loc: ["body", "full_name"], msg: "Field required" }],
    });

    const error = await apiClient.post("/auth/register", {}).catch((e) => e);
    expect(error.fieldErrors).toEqual({ full_name: "Field required" });
    expect(error.message).toBe("Field required");
  });

  it("prefers the backend's { message } when present", async () => {
    api.onGet("/ping").reply(500, { status: false, message: "Database unavailable" });

    const error = await apiClient.get("/ping").catch((e) => e);
    expect(error.message).toBe("Database unavailable");
  });

  it("reports network failures in plain words", async () => {
    api.onGet("/ping").networkError();

    const error = await apiClient.get("/ping").catch((e) => e);
    expect(error.status).toBeNull();
    expect(error.message).toBe("Can't reach the server. Check your connection.");
  });

  it("reports timeouts", async () => {
    api.onGet("/ping").timeout();

    const error = await apiClient.get("/ping").catch((e) => e);
    expect(error.message).toBe("The request timed out.");
  });

  it("on 401 with a token: clears it and fires the expired event", async () => {
    setAuthToken("stale");
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    api.onGet("/auth/user").reply(401, { detail: "Invalid or expired token" });

    await apiClient.get("/auth/user").catch(() => {});
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);

    expect(getAuthToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("on 401 without a token (wrong password): does not fire the expired event", async () => {
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    api.onPost("/auth/login").reply(401, { detail: "Invalid email or password" });

    const error = await apiClient.post("/auth/login", {}).catch((e) => e);
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);

    expect(error.message).toBe("Invalid email or password");
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe("token expiry", () => {
  it("reads exp from a JWT", () => {
    const token = makeToken(60);
    expect(getTokenExpiry(token)).toBeGreaterThan(Date.now());
    expect(isTokenExpired(token)).toBe(false);
  });

  it("detects an expired JWT", () => {
    expect(isTokenExpired(makeToken(-60))).toBe(true);
  });

  it("treats an unreadable token as having no known expiry", () => {
    expect(getTokenExpiry("not-a-jwt")).toBeNull();
    expect(isTokenExpired("not-a-jwt")).toBe(false);
  });
});
