import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { NotificationPermissionPanel } from "@/components/notifications/notification-permission-panel";

export default function NotificationsSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-2 text-muted-foreground">
          Manage browser notification permission for OmniTool.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Browser permission</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationPermissionPanel variant="full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Use <strong className="text-foreground">HTTPS</strong> or{" "}
            <strong className="text-foreground">localhost</strong> — browsers do
            not allow notifications on insecure HTTP origins.
          </p>
          <p>
            On <strong className="text-foreground">iOS</strong>, install OmniTool
            to the Home Screen (Share → Add to Home Screen) for notification
            support in recent iOS versions.
          </p>
          <p>
            If you chose <strong className="text-foreground">Block</strong>,
            open your browser&apos;s site settings for this URL and reset
            notifications to <strong className="text-foreground">Ask</strong>,
            then use &quot;Allow notifications&quot; again here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
