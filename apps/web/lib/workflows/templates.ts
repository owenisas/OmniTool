export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger: {
    kind: string;
    eventTypes?: string;
    cronExpr?: string;
    timezone?: string;
  };
  steps: Array<{
    kind: string;
    config: Record<string, unknown>;
    label?: string;
  }>;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "auto-triage",
    name: "Auto-Triage Issues",
    description:
      "When an issue is created, AI categorizes it and suggests priority/assignee, then notifies the team via Slack.",
    category: "issue-management",
    trigger: {
      kind: "event",
      eventTypes: JSON.stringify(["issue.created"]),
    },
    steps: [
      {
        kind: "agent",
        config: {
          agentType: "triage",
          prompt:
            "Analyze this new issue. Determine priority (P0-P3), category, and suggest an assignee based on team expertise.",
        },
        label: "AI Triage",
      },
      {
        kind: "action",
        config: {
          type: "send_slack",
          params: { text: "New issue triaged: {step_0.text}" },
        },
        label: "Notify Slack",
      },
    ],
  },
  {
    id: "daily-standup",
    name: "Daily Standup Report",
    description:
      "Every weekday at 9am, generates a team standup from activity events and coding sessions, posts to Slack.",
    category: "reporting",
    trigger: {
      kind: "schedule",
      cronExpr: "0 9 * * 1-5",
      timezone: "America/New_York",
    },
    steps: [
      {
        kind: "agent",
        config: {
          agentType: "report",
          prompt:
            "Generate a daily standup summary. Include: tasks completed yesterday, tasks planned today, blockers. Pull from recent activity events.",
        },
        label: "Generate Standup",
      },
      {
        kind: "action",
        config: {
          type: "send_slack",
          params: { text: "{step_0.text}" },
        },
        label: "Post to Slack",
      },
      {
        kind: "action",
        config: {
          type: "create_note",
          params: { title: "Standup - {date}" },
        },
        label: "Save as Note",
      },
    ],
  },
  {
    id: "weekly-sprint-report",
    name: "Weekly Sprint Report",
    description:
      "Every Friday at 5pm, analyzes sprint performance and posts a summary.",
    category: "reporting",
    trigger: {
      kind: "schedule",
      cronExpr: "0 17 * * 5",
      timezone: "America/New_York",
    },
    steps: [
      {
        kind: "agent",
        config: {
          agentType: "insight",
          prompt:
            "Analyze this week's sprint performance. Include velocity, completion rate, PR merge stats, blockers, and trends vs last week.",
        },
        label: "Analyze Sprint",
      },
      {
        kind: "agent",
        config: {
          agentType: "report",
          prompt:
            "Format the sprint analysis into a polished weekly report with sections: Highlights, Metrics, Risks, Next Week.",
        },
        label: "Format Report",
      },
      {
        kind: "action",
        config: {
          type: "send_slack",
          params: { text: "{step_1.text}" },
        },
        label: "Post to Slack",
      },
    ],
  },
  {
    id: "pr-review-reminder",
    name: "PR Review Reminder",
    description:
      "When a PR is opened, waits 1 hour, then reminds the team if no reviews yet.",
    category: "github",
    trigger: {
      kind: "event",
      eventTypes: JSON.stringify(["github.pr.opened"]),
    },
    steps: [
      {
        kind: "delay",
        config: { seconds: 3600 },
        label: "Wait 1 hour",
      },
      {
        kind: "action",
        config: {
          type: "send_slack",
          params: {
            text: "PR still needs review: {triggerData.payload.title} by {triggerData.payload.author}",
          },
        },
        label: "Remind Team",
      },
    ],
  },
  {
    id: "risk-detection",
    name: "Daily Risk Detection",
    description:
      "Scans for overdue tasks, stalled PRs, and declining velocity every weekday morning.",
    category: "monitoring",
    trigger: {
      kind: "schedule",
      cronExpr: "0 10 * * 1-5",
      timezone: "America/New_York",
    },
    steps: [
      {
        kind: "agent",
        config: {
          agentType: "insight",
          prompt:
            "Scan active projects for risks: overdue tasks (>48h past due), issues without assignees for >48h, PRs open >5 days, velocity declining week-over-week. List each risk with severity.",
        },
        label: "Detect Risks",
      },
      {
        kind: "condition",
        config: {
          field: "step_0.text",
          operator: "contains",
          value: "risk",
          trueStep: 2,
          falseStep: 3,
        },
        label: "Risks Found?",
      },
      {
        kind: "action",
        config: {
          type: "send_slack",
          params: {
            text: "Risk Detection:\n{step_0.text}",
          },
        },
        label: "Alert Team",
      },
    ],
  },
  {
    id: "handoff-notification",
    name: "Handoff Completion Notification",
    description:
      "When an agent handoff completes, notifies Slack and requests human review.",
    category: "handoffs",
    trigger: {
      kind: "event",
      eventTypes: JSON.stringify(["handoff.completed"]),
    },
    steps: [
      {
        kind: "action",
        config: {
          type: "send_slack",
          params: {
            text: "Agent handoff completed: {triggerData.payload.title}. Please review results.",
          },
        },
        label: "Notify",
      },
      {
        kind: "approval",
        config: { timeout: 172800 },
        label: "Await Review",
      },
      {
        kind: "agent",
        config: {
          agentType: "report",
          prompt:
            "Generate a summary of what was accomplished in this handoff based on the context.",
        },
        label: "Summarize",
      },
    ],
  },
];
