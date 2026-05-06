/**
 * Smoke test for the OAuth mock server harness. Verifies the three endpoints
 * behave exactly as our integration callback expects so we can rely on the
 * mock for higher-level E2E.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startOAuthMock, type OAuthMockHandle } from "../harness/oauth-mock";

let server: OAuthMockHandle;
let baseUrl: string;

beforeAll(async () => {
  server = await startOAuthMock({ port: 5556 });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(async () => {
  await server.close();
});

describe("oauth-mock harness", () => {
  it("authorize endpoint redirects with code + state", async () => {
    const res = await fetch(
      `${baseUrl}/login/oauth/authorize?redirect_uri=${encodeURIComponent(
        "http://localhost:19283/api/integrations/github/callback",
      )}&state=mockstate&client_id=fake&scope=user:email`,
      { redirect: "manual" },
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/api/integrations/github/callback");
    expect(location.searchParams.get("code")).toBe("mock_authcode_42");
    expect(location.searchParams.get("state")).toBe("mockstate");
  });

  it("token endpoint exchanges code for access token", async () => {
    const res = await fetch(`${baseUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: "fake",
        client_secret: "fake",
        code: "mock_authcode_42",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBe("ghp_mock_access_token");
  });

  it("token endpoint rejects bad code", async () => {
    const res = await fetch(`${baseUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "wrong" }),
    });
    const body = await res.json();
    expect(body.error).toBe("bad_verification_code");
  });

  it("user endpoint returns profile when bearer token matches", async () => {
    const res = await fetch(`${baseUrl}/api/user`, {
      headers: { Authorization: "Bearer ghp_mock_access_token" },
    });
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.login).toBe("omnitool-test");
    expect(user.id).toBe(1234567);
  });

  it("user endpoint 401s on bad token", async () => {
    const res = await fetch(`${baseUrl}/api/user`, {
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("records call history for assertions", async () => {
    const before = server.calls.length;
    await fetch(`${baseUrl}/login/oauth/authorize?redirect_uri=http://x/&state=s`, {
      redirect: "manual",
    });
    expect(server.calls.length).toBe(before + 1);
    expect(server.calls[server.calls.length - 1]!.path).toBe(
      "/login/oauth/authorize",
    );
  });
});
