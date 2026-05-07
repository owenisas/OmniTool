/**
 * Built-in note templates shipped with OmniTool. These are seeded as
 * `isBuiltIn = true` rows in the `note_templates` table and are visible to
 * every user regardless of team membership.
 *
 * Block structures follow the BlockNote JSON schema used by the note editor.
 */
export const builtInTemplates = [
  {
    title: "Meeting Notes",
    emoji: "📋",
    description:
      "Structured meeting notes with attendees, agenda, and action items",
    category: "meetings",
    blocks: [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Attendees" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Agenda" }],
      },
      {
        type: "numberedListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Discussion" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Action Items" }],
      },
      {
        type: "checkListItem",
        props: { checked: false },
        content: [{ type: "text", text: "" }],
      },
    ],
  },
  {
    title: "Weekly Review",
    emoji: "📊",
    description:
      "Weekly progress review with wins, challenges, and next week plans",
    category: "reviews",
    blocks: [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Wins This Week" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Challenges" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Key Metrics" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Plans for Next Week" }],
      },
      {
        type: "numberedListItem",
        content: [{ type: "text", text: "" }],
      },
    ],
  },
  {
    title: "Design Document",
    emoji: "🎨",
    description:
      "Technical design doc with problem, proposal, alternatives, and timeline",
    category: "engineering",
    blocks: [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Problem Statement" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Proposed Solution" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Alternatives Considered" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Implementation Plan" }],
      },
      {
        type: "numberedListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Timeline" }],
      },
      { type: "paragraph", content: [] },
    ],
  },
  {
    title: "Bug Triage",
    emoji: "🐛",
    description:
      "Bug report template with repro steps, expected/actual behavior, and severity",
    category: "engineering",
    blocks: [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Summary" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Steps to Reproduce" }],
      },
      {
        type: "numberedListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Expected Behavior" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Actual Behavior" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Severity & Impact" }],
      },
      { type: "paragraph", content: [] },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Environment" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
    ],
  },
  {
    title: "Sprint Retrospective",
    emoji: "🔄",
    description:
      "Sprint retro with what went well, what didn't, and improvements",
    category: "agile",
    blocks: [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "What Went Well" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "What Didn't Go Well" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Action Items for Improvement" }],
      },
      {
        type: "checkListItem",
        props: { checked: false },
        content: [{ type: "text", text: "" }],
      },
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Shoutouts" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "" }],
      },
    ],
  },
] as const;
