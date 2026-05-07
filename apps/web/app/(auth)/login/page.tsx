"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";
import { Separator } from "@omnitool/ui/components/separator";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";

/**
 * Read URL search params. Wrapped by a Suspense boundary one level up so it
 * doesn't bubble the suspension to the entire login Card (which would cause
 * a visible "card → skeleton → card" flash on first paint).
 */
function useLoginParams() {
  const search = useSearchParams();
  return {
    callbackUrl: search.get("callbackUrl") ?? "/",
    authError: search.get("error"),
  };
}

function ErrorBanner() {
  const { authError } = useLoginParams();
  if (!authError) return null;
  return (
    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      Authentication failed. Please try again.
    </div>
  );
}

function SocialButtonsSlot() {
  const { callbackUrl } = useLoginParams();
  return <SocialAuthButtons mode="login" callbackUrl={callbackUrl} />;
}

function PasswordForm() {
  const { callbackUrl } = useLoginParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        // Hard navigation — middleware sets cookies, server renders dashboard
        // in one pass. Avoids router.push() + router.refresh() double-trip.
        window.location.href = callbackUrl;
        return;
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Link
            href="/reset-password"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}

/**
 * The login Card renders unconditionally; only the slots that read
 * `useSearchParams` are wrapped in tiny Suspense boundaries. This prevents
 * the whole card from being replaced by a skeleton during the initial
 * static-render → client-resume swap.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">OmniTool</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Suspense fallback={null}>
            <SocialButtonsSlot />
          </Suspense>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                or continue with email
              </span>
            </div>
          </div>

          <Suspense fallback={null}>
            <ErrorBanner />
          </Suspense>

          <Suspense fallback={null}>
            <PasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
