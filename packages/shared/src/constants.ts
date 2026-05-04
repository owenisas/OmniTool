export const APP_NAME = "OmniTool";

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const ISSUE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  TRIAGED: "Triaged",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  WONT_FIX: "Won't Fix",
};

export const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "Critical",
  MAJOR: "Major",
  MINOR: "Minor",
  TRIVIAL: "Trivial",
};

export const PROVIDER_LABELS: Record<string, string> = {
  GITHUB: "GitHub",
  NOTION: "Notion",
  SLACK: "Slack",
  LINEAR: "Linear",
  GOOGLE: "Google",
  JIRA: "Jira",
  FIGMA: "Figma",
  DISCORD: "Discord",
};

export const METRIC_TYPE_LABELS: Record<string, string> = {
  VELOCITY: "Velocity",
  COMPLETION_RATE: "Completion Rate",
  CYCLE_TIME: "Cycle Time",
  THROUGHPUT: "Throughput",
  BURNDOWN: "Burndown",
  TIME_LOGGED: "Time Logged",
};
