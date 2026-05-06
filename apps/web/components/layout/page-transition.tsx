"use client";

import { usePathname } from "next/navigation";

/**
 * Subtle fade + slide animation on every route change inside the dashboard.
 *
 * The inner `<div>` is keyed by `pathname` so it remounts on each navigation,
 * re-triggering the Tailwind `animate-in fade-in-0 slide-in-from-bottom-1`
 * utilities. The wrapper itself stays mounted so React reconciliation cost
 * matches a normal navigation. `motion-reduce:animate-none` respects the
 * user's prefers-reduced-motion setting.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}
