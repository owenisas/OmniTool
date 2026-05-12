"use client";

import { Toaster } from "sonner";
import { TRPCReactProvider } from "@/trpc/client";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DesktopAuthDeepLinkHandler } from "@/components/auth/desktop-auth-deep-link-handler";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DesktopAuthDeepLinkHandler />
      <TRPCReactProvider>{children}</TRPCReactProvider>
      {/* Global toast root used by background-tasks runner + ad-hoc notices. */}
      <Toaster
        richColors
        position="bottom-right"
        closeButton
        toastOptions={{ duration: 5000 }}
      />
    </ThemeProvider>
  );
}
