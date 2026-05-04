import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { Badge } from "@omnitool/ui/components/badge";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
              U
            </div>
            <div>
              <h2 className="text-xl font-semibold">Loading...</h2>
              <p className="text-muted-foreground">User ID: {userId}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No connected accounts yet. Connect services from Settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
