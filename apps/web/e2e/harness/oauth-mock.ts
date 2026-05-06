/**
 * OAuth provider mock server.
 *
 * Mimics the subset of GitHub OAuth endpoints used by:
 *   - Supabase external providers (sign-in flow): GitHub redirects through
 *     Supabase's `/auth/v1/callback`, but we don't go through Supabase here —
 *     E2E targets the integration-OAuth flow directly (Connect GitHub).
 *   - OmniTool integrations (`/api/integrations/github/{authorize,callback}`):
 *     this is the path our E2E exercises.
 *
 * Endpoints implemented (compatible with what `apps/web/app/api/integrations/
 * github/callback/route.ts` calls):
 *   GET  /login/oauth/authorize    → instantly redirects to redirect_uri with
 *                                    a pre-canned `code` (no UI, no real auth)
 *   POST /login/oauth/access_token → returns a fixed access_token JSON
 *   GET  /api/user                 → returns the fixed user profile that
 *                                    the callback persists into ConnectedAccount
 *
 * Use:
 *   const server = await startOAuthMock({ port: 5555 });
 *   process.env.GITHUB_AUTHORIZE_URL = `http://localhost:5555/login/oauth/authorize`;
 *   process.env.GITHUB_TOKEN_URL = `http://localhost:5555/login/oauth/access_token`;
 *   process.env.GITHUB_USER_URL = `http://localhost:5555/api/user`;
 *   // ... run E2E ...
 *   await server.close();
 */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export interface OAuthMockOptions {
  port: number;
  /** Code returned by the authorize endpoint and accepted by token endpoint. */
  code?: string;
  /** Access token returned by the token endpoint. */
  accessToken?: string;
  /** Fake GitHub user profile returned by /api/user. */
  user?: {
    id: number;
    login: string;
    name?: string;
    email?: string;
    avatar_url?: string;
  };
  /** Optional logger — defaults to console.log when DEBUG_OAUTH_MOCK is set. */
  log?: (msg: string) => void;
}

export interface OAuthMockHandle {
  port: number;
  close: () => Promise<void>;
  /** History of requests for assertions. */
  calls: Array<{ method: string; path: string; query: URLSearchParams }>;
}

const DEFAULTS = {
  code: "mock_authcode_42",
  accessToken: "ghp_mock_access_token",
  user: {
    id: 1234567,
    login: "omnitool-test",
    name: "OmniTool Test User",
    email: "test@omnitool.dev",
    avatar_url: "https://avatars.githubusercontent.com/u/1234567",
  },
};

export function startOAuthMock(opts: OAuthMockOptions): Promise<OAuthMockHandle> {
  const code = opts.code ?? DEFAULTS.code;
  const accessToken = opts.accessToken ?? DEFAULTS.accessToken;
  const user = opts.user ?? DEFAULTS.user;
  const log =
    opts.log ?? (process.env.DEBUG_OAUTH_MOCK ? console.log : () => {});
  const calls: OAuthMockHandle["calls"] = [];

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  }

  function send(
    res: ServerResponse,
    status: number,
    body: unknown,
    contentType = "application/json",
  ) {
    const payload =
      typeof body === "string" ? body : JSON.stringify(body);
    res.statusCode = status;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", Buffer.byteLength(payload).toString());
    res.end(payload);
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);
    calls.push({
      method: req.method ?? "GET",
      path: url.pathname,
      query: url.searchParams,
    });
    log(`[oauth-mock] ${req.method} ${url.pathname}${url.search}`);

    // ── /login/oauth/authorize ────────────────────────────────────────
    // Real GitHub renders a consent page. We skip directly to the
    // redirect_uri with a fixed code, simulating "user already approved".
    if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      if (!redirectUri) {
        send(res, 400, { error: "missing redirect_uri" });
        return;
      }
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (state) target.searchParams.set("state", state);
      res.statusCode = 302;
      res.setHeader("Location", target.toString());
      res.end();
      return;
    }

    // ── POST /login/oauth/access_token ────────────────────────────────
    if (
      req.method === "POST" &&
      url.pathname === "/login/oauth/access_token"
    ) {
      const body = await readBody(req);
      let parsed: Record<string, string> = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        // form-encoded fallback
        parsed = Object.fromEntries(new URLSearchParams(body));
      }
      if (parsed.code !== code) {
        send(res, 200, { error: "bad_verification_code" });
        return;
      }
      send(res, 200, {
        access_token: accessToken,
        token_type: "bearer",
        scope: "user:email,repo",
      });
      return;
    }

    // ── GET /api/user ─────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/user") {
      const auth = req.headers["authorization"];
      if (auth !== `Bearer ${accessToken}` && auth !== `token ${accessToken}`) {
        send(res, 401, { message: "Bad credentials" });
        return;
      }
      send(res, 200, user);
      return;
    }

    send(res, 404, { error: "not_found" });
  };

  return new Promise((resolve, reject) => {
    const server: Server = createServer(handler);
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      resolve({
        port: opts.port,
        close: () =>
          new Promise<void>((r, j) =>
            server.close((err) => (err ? j(err) : r())),
          ),
        calls,
      });
    });
  });
}
