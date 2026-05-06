// @vitest-environment happy-dom
/**
 * Unit tests for the Tauri shim layer (`lib/tauri.ts`).
 *
 * Runs in happy-dom so `window` exists naturally. `@tauri-apps/api/mocks`
 * attaches a fake `__TAURI_INTERNALS__.invoke` to that window so the desktop
 * branches execute against a controllable IPC bus. Catches typoed plugin
 * names, wrong arg shapes, and silent fallbacks (e.g., openInBrowser
 * dropping to window.open when shell.open should have been called).
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";

beforeEach(() => {
  // Reset the mocks namespace and any module cache so each test sees a
  // fresh import of `./tauri` with no leftover global state.
  clearMocks();
  vi.resetModules();
  // Wipe Tauri-specific globals between tests (mockIPC sets these).
  delete (globalThis as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  delete (globalThis as { isTauri?: unknown }).isTauri;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isTauri", () => {
  it("returns false on plain web (no Tauri globals)", async () => {
    const { isTauri } = await import("./tauri");
    expect(isTauri()).toBe(false);
  });

  it("returns true when __TAURI_INTERNALS__ is present", async () => {
    mockIPC(() => undefined);
    const { isTauri } = await import("./tauri");
    expect(isTauri()).toBe(true);
  });

  it("returns true when globalThis.isTauri === true", async () => {
    (globalThis as { isTauri?: boolean }).isTauri = true;
    const { isTauri } = await import("./tauri");
    expect(isTauri()).toBe(true);
  });
});

describe("openInBrowser", () => {
  it("invokes plugin:shell|open with the URL on desktop", async () => {
    const calls: { cmd: string; args: unknown }[] = [];
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      return Promise.resolve();
    });
    const { openInBrowser } = await import("./tauri");
    await openInBrowser("https://github.com/login/oauth/authorize?x=1");
    const opens = calls.filter((c) => c.cmd === "plugin:shell|open");
    expect(opens.length).toBeGreaterThanOrEqual(1);
    expect((opens[0]!.args as { path: string }).path).toBe(
      "https://github.com/login/oauth/authorize?x=1",
    );
  });

  it("falls back to window.open on web", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const { openInBrowser } = await import("./tauri");
    await openInBrowser("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank");
  });
});

describe("startOAuthFlow", () => {
  it("on desktop fetches JSON authorize URL and opens it via shell", async () => {
    const fetchCalls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetchCalls.push(url);
      return new Response(
        JSON.stringify({ url: "https://provider.example/authorize?x=1" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const ipcCalls: { cmd: string; args: unknown }[] = [];
    mockIPC((cmd, args) => {
      ipcCalls.push({ cmd, args });
      return Promise.resolve();
    });
    const { startOAuthFlow } = await import("./tauri");
    await startOAuthFlow("/api/integrations/github/authorize");
    expect(fetchCalls).toEqual(["/api/integrations/github/authorize"]);
    const opens = ipcCalls.filter((c) => c.cmd === "plugin:shell|open");
    expect(opens.length).toBeGreaterThanOrEqual(1);
    expect((opens[0]!.args as { path: string }).path).toBe(
      "https://provider.example/authorize?x=1",
    );
  });

  it("on desktop throws when authorize route returns no url", async () => {
    vi.stubGlobal("fetch", async () => {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    mockIPC(() => Promise.resolve());
    const { startOAuthFlow } = await import("./tauri");
    await expect(
      startOAuthFlow("/api/integrations/github/authorize"),
    ).rejects.toThrow(/no URL/i);
  });

  it("on web sets window.location.href to the authorize URL", async () => {
    // happy-dom's `window.location.href` is a real setter that triggers a
    // navigation attempt. To assert without crashing the test, use a Proxy.
    let assigned = "";
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        get href() {
          return assigned;
        },
        set href(v: string) {
          assigned = v;
        },
      },
    });
    const { startOAuthFlow } = await import("./tauri");
    await startOAuthFlow("/api/integrations/github/authorize");
    expect(assigned).toBe("/api/integrations/github/authorize");
  });
});
