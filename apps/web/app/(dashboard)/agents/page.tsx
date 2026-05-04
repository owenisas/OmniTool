import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@omnitool/ui/components/card";
import { Bot, GitBranch, BarChart3, Bell, History } from "lucide-react";
import Link from "next/link";

const agents = [
  {
    title: "Chat Assistant",
    description: "Ask questions about your projects, tasks, and metrics",
    icon: Bot,
    href: "/agents/chat",
  },
  {
    title: "Coding Sessions",
    description: "See whether local AI coding-agent stores have session files",
    icon: History,
    href: "/agents/sessions",
  },
  {
    title: "Triage Agent",
    description: "Assign open, unassigned issues across projects",
    icon: GitBranch,
    href: "/agents/triage",
  },
  {
    title: "Insight Agent",
    description: "Weekly velocity from tasks marked done with story points",
    icon: BarChart3,
    href: "/agents/insights",
  },
  {
    title: "Alert Agent",
    description: "In-app digest of deadlines and what needs attention",
    icon: Bell,
    href: "/agents/alerts",
  },
];

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground mt-2">
          AI-powered assistants to help you work smarter.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <Link key={agent.title} href={agent.href}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <agent.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{agent.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{agent.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
