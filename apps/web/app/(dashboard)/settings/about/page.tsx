import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";

export default function AboutSettingsPage() {
  const version =
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "development";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About OmniTool</h1>
        <p className="mt-2 text-muted-foreground">
          Internal productivity app for teams: projects, tasks, issues, notes,
          metrics, and AI helpers.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Build</CardTitle>
          <CardDescription>
            Display version comes from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              NEXT_PUBLIC_APP_VERSION
            </code>{" "}
            when set at build time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Version label:</span>{" "}
            <span className="font-mono font-medium">{version}</span>
          </p>
          <p className="text-muted-foreground">
            Stack: Next.js, React, Tauri (desktop), PostgreSQL, Prisma, tRPC,
            Auth.js, Tailwind, shadcn/ui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
