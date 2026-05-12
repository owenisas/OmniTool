import { describe, expect, it } from "vitest";
import {
  extractBearerFromRequest,
  generatePersonalAccessToken,
  hashToken,
  tokensMatch,
} from "./token";

describe("MCP token helpers", () => {
  it("generates an omt_ prefixed plaintext + sha256 hash", () => {
    const { plaintext, hashed } = generatePersonalAccessToken();
    expect(plaintext.startsWith("omt_")).toBe(true);
    expect(plaintext.length).toBeGreaterThan(20);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(plaintext)).toBe(hashed);
  });

  it("tokensMatch returns true for identical strings", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
  });

  it("tokensMatch returns false for length mismatch", () => {
    expect(tokensMatch("abc", "abcd")).toBe(false);
  });

  it("extractBearerFromRequest parses Authorization header", () => {
    const req = new Request("http://localhost/api/mcp", {
      headers: { authorization: "Bearer omt_xyz" },
    });
    expect(extractBearerFromRequest(req)).toBe("omt_xyz");
  });

  it("extractBearerFromRequest ignores query param by default", () => {
    const req = new Request("http://localhost/api/mcp?token=omt_qry");
    expect(extractBearerFromRequest(req)).toBe(null);
  });

  it("extractBearerFromRequest can opt into query param fallback", () => {
    const req = new Request("http://localhost/api/mcp?token=omt_qry");
    expect(extractBearerFromRequest(req, { allowQueryToken: true })).toBe(
      "omt_qry",
    );
  });

  it("extractBearerFromRequest prefers Authorization over query token", () => {
    const req = new Request("http://localhost/api/mcp?token=omt_qry", {
      headers: { authorization: "Bearer omt_hdr" },
    });
    expect(extractBearerFromRequest(req)).toBe("omt_hdr");
  });

  it("extractBearerFromRequest returns null when neither set", () => {
    const req = new Request("http://localhost/api/mcp");
    expect(extractBearerFromRequest(req)).toBe(null);
  });
});
