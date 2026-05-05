"use client";

import { TRPCReactProvider } from "@/trpc/client";
import { PowerSyncProvider } from "@/components/providers/powersync-provider";
import { TeamProvider } from "@/components/providers/team-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TRPCReactProvider>
        <TeamProvider>
          <PowerSyncProvider>{children}</PowerSyncProvider>
        </TeamProvider>
      </TRPCReactProvider>
    </ThemeProvider>
  );
}
