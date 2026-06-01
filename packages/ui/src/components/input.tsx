import * as React from "react";
import { cn } from "../lib/utils";

/**
 * `InputProps` already includes `aria-invalid` and `aria-describedby` via
 * `InputHTMLAttributes` — both are forwarded to the underlying `<input>`.
 * Set `aria-invalid` to render the destructive error styling, and point
 * `aria-describedby` at the id of an error/help message element so screen
 * readers announce it. Example:
 *
 * ```tsx
 * <Input aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined} />
 * {error && <p id="email-error" role="alert">{error}</p>}
 * ```
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          // Error state: when the consumer sets `aria-invalid` (e.g. wired to a
          // form validation library), swap the border + focus ring to the
          // destructive token so the field reads as invalid for sighted users
          // while screen readers get the aria-invalid announcement. Fully
          // backward compatible — no change unless aria-invalid is truthy.
          "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
