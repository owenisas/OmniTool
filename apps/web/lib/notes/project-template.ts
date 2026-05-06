/**
 * BlockNote initial content for an auto-generated project note.
 *
 * Layout (one note per project, sectioned):
 *   - Project card embed (live data)
 *   - H2 "Initial Idea" + empty paragraph
 *   - H2 "Progress" + empty paragraph
 *   - H2 "Tasks" + auto-embedded task list filtered by project
 */
export function projectNoteTemplate(projectId: string) {
  return [
    {
      type: "projectCard",
      props: { projectId },
    },
    {
      type: "heading",
      props: { level: 2 },
      content: "Initial Idea",
    },
    {
      type: "paragraph",
      content: "",
    },
    {
      type: "heading",
      props: { level: 2 },
      content: "Progress",
    },
    {
      type: "paragraph",
      content: "",
    },
    {
      type: "heading",
      props: { level: 2 },
      content: "Tasks",
    },
    {
      type: "taskList",
      props: {
        projectId,
        statusFilter: "OPEN",
        limit: 8,
        assigneeFilter: "any",
        label: "",
      },
    },
  ];
}

/**
 * Plaintext approximation of the template for the searchable contentText column.
 */
export function projectNoteTemplateText(projectName: string): string {
  return [
    `[Project: ${projectName}]`,
    "Initial Idea",
    "Progress",
    "Tasks",
    `[Tasks: ${projectName} — OPEN]`,
  ].join("\n\n");
}
