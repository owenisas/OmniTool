"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { cn } from "@/lib/utils";
import {
  UserCircle,
  Shield,
  Users,
  Bell,
  Palette,
  Plug,
  Info,
  Terminal,
  StickyNote,
} from "lucide-react";

const GROUPS = [
  {
    label: "Account",
    links: [
      { href: "/settings/profile", label: "Profile", icon: UserCircle },
      { href: "/settings/security", label: "Security", icon: Shield },
    ],
  },
  {
    label: "Workspace",
    links: [{ href: "/settings/team", label: "Team", icon: Users }],
  },
  {
    label: "Preferences",
    links: [
      { href: "/settings/notifications", label: "Notifications", icon: Bell },
      { href: "/settings/appearance", label: "Appearance", icon: Palette },
      { href: "/settings/notes", label: "Notes", icon: StickyNote },
    ],
  },
  {
    label: "Connections",
    links: [
      { href: "/settings/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    label: "Developer",
    links: [
      {
        href: "/settings/coding-sessions",
        label: "Coding Sessions",
        icon: Terminal,
      },
    ],
  },
  {
    label: "About",
    links: [{ href: "/settings/about", label: "About OmniTool", icon: Info }],
  },
];

const ALL_LINKS = GROUPS.flatMap((g) =>
  g.links.map((l) => ({ ...l, group: g.label }))
);

export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();

  const flatNav = ALL_LINKS.map((l) => ({
    href: l.href,
    label: `${l.group}: ${l.label}`,
    short: l.label,
  }));

  return (
    <>
      <div className="lg:hidden">
        <label className="sr-only" htmlFor="settings-nav-mobile">
          Settings section
        </label>
        <Select
          value={
            pathname === "/settings" || pathname === "/settings/"
              ? "/settings"
              : pathname
          }
          onValueChange={(href) => {
            if (href && href !== pathname) router.push(href);
          }}
        >
          <SelectTrigger id="settings-nav-mobile" className="w-full">
            <SelectValue placeholder="Jump to…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="/settings">Overview</SelectItem>
            {flatNav.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <nav className="hidden lg:block space-y-6" aria-label="Settings">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.links.map((link) => {
                const active =
                  pathname === link.href ||
                  (link.href !== "/settings" &&
                    pathname.startsWith(`${link.href}/`));
                const Icon = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-80" />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
