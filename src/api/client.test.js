import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiClient,
  ApiError,
  AUTH_EXPIRED_EVENT,
  getAuthToken,
  getRefreshToken,
  getTokenExpiry,
  isTokenExpired,
  resolveApiBaseUrl,
  setAuthToken,
  setRefreshToken,
} from "./client.js";
import { makeToken, mockApi, ok } from "../test/helpers.jsx";

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

  it("on 401 with a token and no refresh token: clears it and fires the expired event", async () => {
    setAuthToken("stale");
    const onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    api.onGet("/users/me").reply(401, { detail: "Invalid or expired token" });

    await apiClient.get("/users/me").catch(() => {});
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

describe("session refresh on 401", () => {
  let api;
  let onExpired;
  beforeEach(() => {
    api = mockApi();
    onExpired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    setAuthToken("old-access");
    setRefreshToken("refresh-1");
  });
  afterEach(() => {
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    api.restore();
  });

  const acceptOnly = (token) => (config) =>
    config.headers.Authorization === `Bearer ${token}` ? [200, { ok: true }] : [401, { detail: "expired" }];

  it("renews the token and replays the request, without signing out", async () => {
    api.onPost("/auth/refresh").reply((config) =>
      JSON.parse(config.data).refresh_token === "refresh-1"
        ? [200, ok({ token: "new-access", refresh_token: "refresh-2" })]
        : [401, { detail: "bad refresh" }]
    );
    api.onGet("/materials").reply(acceptOnly("new-access"));

    const response = await apiClient.get("/materials");

    expect(response.data).toEqual({ ok: true });
    expect(getAuthToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("refresh-2");
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("sends the refresh request without the expired bearer token", async () => {
    api.onPost("/auth/refresh").reply((config) => [
      config.headers.Authorization ? 400 : 200,
      ok({ token: "new-access", refresh_token: "refresh-2" }),
    ]);
    api.onGet("/materials").reply(acceptOnly("new-access"));

    await expect(apiClient.get("/materials")).resolves.toBeTruthy();
  });

  it("refreshes once for several requests that fail together", async () => {
    api.onPost("/auth/refresh").reply(200, ok({ token: "new-access", refresh_token: "refresh-2" }));
    api.onGet(/\/item\/\d/).reply(acceptOnly("new-access"));

    await Promise.all([1, 2, 3].map((n) => apiClient.get(`/item/${n}`)));

    expect(api.history.post.filter((r) => r.url === "/auth/refresh")).toHaveLength(1);
  });

  it("signs out when the refresh token is rejected too", async () => {
    api.onPost("/auth/refresh").reply(401, { detail: "Your session has expired" });
    api.onGet("/materials").reply(401, { detail: "expired" });

    const error = await apiClient.get("/materials").catch((e) => e);

    expect(error.status).toBe(401);
    expect(getAuthToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("stays signed in when the refresh fails because the server can't be reached", async () => {
    api.onPost("/auth/refresh").networkError();
    api.onGet("/materials").reply(401, { detail: "expired" });

    const error = await apiClient.get("/materials").catch((e) => e);

    expect(error.status).toBeNull();
    expect(getRefreshToken()).toBe("refresh-1");
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("does not loop when the renewed token is rejected as well", async () => {
    api.onPost("/auth/refresh").reply(200, ok({ token: "new-access", refresh_token: "refresh-2" }));
    api.onGet("/materials").reply(401, { detail: "expired" });

    await apiClient.get("/materials").catch(() => {});

    expect(api.history.get).toHaveLength(2);
    expect(onExpired).toHaveBeenCalledTimes(1);
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

describe("resolveApiBaseUrl", () => {
  it("calls the backend named by VITE_API_PROXY_TARGET directly", () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: "/api", VITE_API_PROXY_TARGET: "https://taskgeneration.onrender.com/" }))
      .toBe("https://taskgeneration.onrender.com/api");
    expect(resolveApiBaseUrl({ VITE_API_PROXY_TARGET: "https://taskgeneration.onrender.com" }))
      .toBe("https://taskgeneration.onrender.com/api");
  });

  it("uses an absolute base URL as is and stays relative without a target", () => {
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: "https://api.example.com/api/", VITE_API_PROXY_TARGET: "http://x" }))
      .toBe("https://api.example.com/api");
    expect(resolveApiBaseUrl({ VITE_API_BASE_URL: "/api" })).toBe("/api");
    expect(resolveApiBaseUrl()).toBe("/api");
  });
});
