import * as React from "react";
import { cn } from "../lib/utils";

/**
 * `aria-invalid` and `aria-describedby` are forwarded to the underlying
 * `<textarea>` (they're part of the spread props). Set `aria-invalid` to
 * render the destructive error styling and point `aria-describedby` at an
 * error/help message id so screen readers announce it. Fully backward
 * compatible — no visual change unless `aria-invalid` is truthy.
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
