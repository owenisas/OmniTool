export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type IssueStatus = "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "WONT_FIX";
export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type Severity = "CRITICAL" | "MAJOR" | "MINOR" | "TRIVIAL";
export type GlobalRole = "ADMIN" | "MEMBER";
export type TeamRole = "OWNER" | "ADMIN" | "MEMBER";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type MetricType = "VELOCITY" | "COMPLETION_RATE" | "CYCLE_TIME" | "THROUGHPUT" | "BURNDOWN" | "TIME_LOGGED";
export type Provider = "GITHUB" | "NOTION" | "SLACK" | "LINEAR" | "GOOGLE" | "JIRA" | "FIGMA" | "DISCORD";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: GlobalRole;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  taskCount: number;
  completedTaskCount: number;
}

export interface PerformanceData {
  velocity: number;
  completionRate: number;
  avgCycleTime: number;
  totalTimeLogged: number;
}
