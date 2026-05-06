"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders `children` into the named topbar slot via a React portal.
 * Use this from any page to inject page-specific content into the topbar
 * (e.g. action buttons on the right). The slot DOM lives in `Topbar`.
 *
 * Renders nothing on the server / before hydration; mounts after the topbar
 * portal target is in the DOM.
 */
export function TopbarSlot({
  target,
  children,
}: {
  target: "actions";
  children: ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setEl(document.getElementById(`topbar-slot-${target}`));
  }, [target]);

  if (!el) return null;
  return createPortal(children, el);
}
