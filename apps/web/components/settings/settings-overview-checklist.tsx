"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { CheckCircle2, Circle } from "lucide-react";

export function SettingsOverviewChecklist() {
  const { data: user } = trpc.user.me.useQuery();
  const { data: connected } = trpc.integration.listConnected.useQuery();
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifGranted(null);
      return;
    }
    setNotifGranted(Notification.permission === "granted");

    const sync = () => setNotifGranted(Notification.permission === "granted");

    if (!navigator.permissions?.query) return;

    let detach: (() => void) | undefined;
    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((status) => {
        status.addEventListener("change", sync);
        detach = () => status.removeEventListener("change", sync);
        sync();
      })
      .catch(() => sync());

    return () => detach?.();
  }, []);

  const hasTeam = (user?.teamMembers?.length ?? 0) > 0;
  const githubConnected = Boolean(
    connected?.some((a) => a.provider === "GITHUB")
  );
  const notificationsOk = notifGranted === true;

  const items = [
    {
      done: hasTeam,
      label: "Join or create a team",
      href: "/settings/team",
    },
    {
      done: notificationsOk,
      label:
        notifGranted === null
          ? "Browser notifications (not available in this environment)"
          : "Allow browser notifications (optional)",
      href: "/settings/notifications",
      muted: notifGranted === null,
    },
    {
      done: githubConnected,
      label: "Connect GitHub (optional)",
      href: "/settings/integrations",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Continue setup</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => {
            const Icon = item.done ? CheckCircle2 : Circle;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground ${item.muted ? "opacity-70" : ""}`}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${item.done ? "text-emerald-600" : ""}`}
                  />
                  <span
                    className={
                      item.done ? "line-through opacity-70" : "font-medium"
                    }
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
