import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";
import {
  UserCircle,
  Users,
  Bell,
  Palette,
  Plug,
  Shield,
  Info,
} from "lucide-react";
import { SettingsOverviewChecklist } from "@/components/settings/settings-overview-checklist";

const settingsLinks = [
  {
    title: "Profile",
    description: "Name, avatar, and account summary",
    href: "/settings/profile",
    icon: UserCircle,
  },
  {
    title: "Security",
    description: "Password for credential sign-in",
    href: "/settings/security",
    icon: Shield,
  },
  {
    title: "Team",
    description: "Members, roles, and workspace details",
    href: "/settings/team",
    icon: Users,
  },
  {
    title: "Notifications",
    description: "Browser notification permission",
    href: "/settings/notifications",
    icon: Bell,
  },
  {
    title: "Appearance",
    description: "Light, dark, or system theme",
    href: "/settings/appearance",
    icon: Palette,
  },
  {
    title: "Integrations",
    description: "GitHub and other connections",
    href: "/settings/integrations",
    icon: Plug,
  },
  {
    title: "About",
    description: "Version and product info",
    href: "/settings/about",
    icon: Info,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Manage your account, workspace, and preferences. Use the navigation on
          the left (or the menu on mobile) to jump between sections.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsOverviewChecklist />
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Your <strong className="text-foreground">active team</strong> is
              chosen from the sidebar switcher; team settings apply to that
              workspace.
            </p>
            <p>
              Theme changes apply immediately and follow your account on this
              browser.
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">
          All sections
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {settingsLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="h-full cursor-pointer transition-colors hover:bg-accent/50">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <link.icon className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">{link.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{link.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
