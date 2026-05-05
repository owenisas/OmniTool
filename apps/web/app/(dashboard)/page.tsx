import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import Link from "next/link";
import {
  LayoutDashboard,
  CheckSquare,
  Bug,
  Clock,
  Bot,
  StickyNote,
  ClipboardList,
} from "lucide-react";
import { DailySummaryButton } from "./daily-summary-dialog";
import { DashboardOverview } from "./dashboard-client";

const quickLinks = [
  {
    title: "My Work",
    description: "Tasks, issues, and notes in one place",
    href: "/work",
    icon: ClipboardList,
  },
  {
    title: "My Tasks",
    description: "Everything assigned to you across projects",
    href: "/tasks",
    icon: CheckSquare,
  },
  {
    title: "Projects",
    description: "Boards and project overview",
    href: "/projects",
    icon: LayoutDashboard,
  },
  {
    title: "Issues",
    description: "Track bugs and incidents",
    href: "/issues",
    icon: Bug,
  },
  {
    title: "Performance",
    description: "Velocity, completion, and time logged",
    href: "/performance",
    icon: Clock,
  },
  {
    title: "AI Agents",
    description: "Chat with AI assistants",
    href: "/agents",
    icon: Bot,
  },
  {
    title: "Notes",
    description: "Capture ideas and notes",
    href: "/notes",
    icon: StickyNote,
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Prioritize what matters across your team&apos;s workspace.
          </p>
        </div>
        <DailySummaryButton />
      </div>

      {/* Client-side overview — uses React Query cache for instant revisits */}
      <DashboardOverview />

      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Shortcuts</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.title} href={link.href}>
              <Card className="cursor-pointer transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-center space-x-4 pb-2">
                  <link.icon className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">{link.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {link.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
