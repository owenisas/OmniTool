"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Appearance</h1>
        <p className="mt-2 text-muted-foreground">
          Choose how OmniTool looks on this device.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Uses the <code className="rounded bg-muted px-1 py-0.5 text-xs">.dark</code>{" "}
            class on the document root. System follows your OS preference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!mounted ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="flex flex-wrap gap-3">
              {OPTIONS.map(({ value, label, icon: Icon }) => {
                const active = theme === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    className={cn(
                      "h-auto flex-col gap-2 py-4 px-6",
                      active && "ring-2 ring-ring ring-offset-2"
                    )}
                    onClick={() => setTheme(value)}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{label}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
