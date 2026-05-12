import { describe, expect, it } from "vitest";
import { parseSlackIntent } from "./mention-handler";

const BOT = "U999BOT";

describe("parseSlackIntent", () => {
  it("parses create issue with project slug", () => {
    const result = parseSlackIntent(
      `<@${BOT}> create issue "Login broken" in api`,
      BOT,
    );
    expect(result.kind).toBe("create_issue");
    expect(result.title).toBe("Login broken");
    expect(result.projectSlug).toBe("api");
  });

  it("parses create issue without project slug", () => {
    const result = parseSlackIntent(
      `<@${BOT}> create issue "Refactor router"`,
      BOT,
    );
    expect(result.kind).toBe("create_issue");
    expect(result.title).toBe("Refactor router");
    expect(result.projectSlug).toBeUndefined();
  });

  it("parses note intent", () => {
    const result = parseSlackIntent(
      `<@${BOT}> note "Standup notes" in core`,
      BOT,
    );
    expect(result.kind).toBe("create_note");
    expect(result.title).toBe("Standup notes");
    expect(result.teamSlug).toBe("core");
  });

  it("falls back to freeform for arbitrary text", () => {
    const result = parseSlackIntent(
      `<@${BOT}> hey can someone look at the deploy?`,
      BOT,
    );
    expect(result.kind).toBe("freeform");
    expect(result.rawText).toContain("can someone look at the deploy?");
  });

  it("strips bot mention and trims text", () => {
    const result = parseSlackIntent(`<@${BOT}>   create issue "X"  `, BOT);
    expect(result.kind).toBe("create_issue");
    expect(result.title).toBe("X");
  });

  it("accepts smart quotes", () => {
    const result = parseSlackIntent(
      `<@${BOT}> create issue “Auth bug”`,
      BOT,
    );
    expect(result.kind).toBe("create_issue");
    expect(result.title).toBe("Auth bug");
  });
});
