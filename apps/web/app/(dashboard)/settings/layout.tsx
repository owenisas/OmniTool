import Link from "next/link";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="lg:w-56 lg:flex-shrink-0 lg:pt-1">
        <div className="lg:sticky lg:top-6">
          <div className="mb-4 hidden lg:block">
            <Link
              href="/settings"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              ← Settings overview
            </Link>
          </div>
          <SettingsNav />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
