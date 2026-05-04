"use client";

import { Bell } from "lucide-react";
import { Button } from "@omnitool/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { NotificationPermissionPanel } from "./notification-permission-panel";

export function NotificationBellMenu() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-1 border-b pb-3 mb-3">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-xs text-muted-foreground">
            Permission for this website — used for local alerts and future push.
          </p>
        </div>
        <NotificationPermissionPanel variant="compact" />
      </PopoverContent>
    </Popover>
  );
}
