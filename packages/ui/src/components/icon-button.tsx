import * as React from "react";
import { Button, type ButtonProps } from "./button";

/**
 * `IconButton` — an icon-only `Button` with an enforced accessible name.
 *
 * Icon-only controls have no visible text, so screen readers fall back to the
 * (usually empty) accessible name and announce nothing useful. Per the
 * WAI-ARIA APG button pattern, every such control needs a programmatic label.
 * This wrapper makes that non-optional at the type level: `aria-label` is a
 * required prop, so you cannot ship a nameless icon button.
 *
 * It defaults `size="icon"` (still overridable) and otherwise forwards every
 * `Button` prop (`variant`, `disabled`, `onClick`, `asChild`, `className`, …).
 *
 * ```tsx
 * <IconButton aria-label="Open navigation menu" variant="ghost" onClick={open}>
 *   <Menu className="h-5 w-5" />
 * </IconButton>
 * ```
 *
 * Note: `asChild` consumers must ensure the rendered child still receives the
 * `aria-label` (Radix `Slot` forwards it automatically).
 */
export interface IconButtonProps extends ButtonProps {
  /** Required accessible name announced by assistive technology. */
  "aria-label": string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "icon", ...props }, ref) => {
    return <Button ref={ref} size={size} {...props} />;
  }
);
IconButton.displayName = "IconButton";

export { IconButton };
