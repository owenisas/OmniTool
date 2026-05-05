import Link from "next/link";
import { WifiOff, CheckSquare, StickyNote, Bug } from "lucide-react";
import { RetryButton } from "./retry-button";

export const metadata = {
  title: "Offline - OmniTool",
};

const localLinks = [
  {
    title: "Tasks",
    description: "View and manage your synced tasks",
    href: "/tasks",
    icon: CheckSquare,
  },
  {
    title: "Notes",
    description: "Access your locally cached notes",
    href: "/notes",
    icon: StickyNote,
  },
  {
    title: "Issues",
    description: "Browse synced issues and bugs",
    href: "/issues",
    icon: Bug,
  },
];

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mx-auto max-w-md space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <WifiOff className="h-8 w-8 text-muted-foreground" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            You&apos;re offline
          </h1>

          <p className="text-muted-foreground">
            It looks like you&apos;ve lost your internet connection. Don&apos;t
            worry — your data is synced locally and you can still access cached
            content. Changes will sync automatically when you&apos;re back
            online.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Available offline
          </h2>

          <div className="grid gap-3">
            {localLinks.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/40"
              >
                <link.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{link.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {link.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="pt-2">
          <RetryButton />
        </div>

        <p className="text-xs text-muted-foreground">
          OmniTool uses local-first sync to keep your data available even
          without a connection.
        </p>
      </div>
    </div>
  );
}
