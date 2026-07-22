"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { GoogleSignInButton } from "@/components/ui/GoogleSignInButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

const FIELD =
  "h-11 rounded-md border border-border bg-surface px-3.5 font-display text-[15px] text-ink outline-none focus-visible:border-pen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pen";
const LABEL =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint";

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading, register, loginWithGoogle } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — send them on rather than showing the form again.
  useEffect(() => {
    if (!loading && user) router.replace(user.role === "admin" ? "/admin" : "/student");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await register({ email, display_name: displayName, password });
      // Self-signup always creates a student.
      router.replace("/student");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reach the server. Is the API running?"
      );
      setSubmitting(false);
    }
  }

  async function onGoogle(credential: string) {
    setError(null);
    try {
      const signedIn = await loginWithGoogle(credential);
      router.replace(signedIn.role === "admin" ? "/admin" : "/student");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed.");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-7">
          <div className="flex items-center justify-between">
            <span className="font-display text-3xl font-extrabold tracking-tight text-pen">
              Lexi<span className="text-correction">.</span>
            </span>
            <ThemeToggle />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-ink">
            Start your streak
          </h1>
          <p className="mt-1 font-body text-[15px] text-ink-soft">
            Create an account to build your own vocabulary. Your teacher can add you to a class
            later.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Name</span>
            <input
              type="text"
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
            />
            <span className="font-body text-[12.5px] text-ink-faint">At least 8 characters.</span>
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-correction bg-correction-soft px-3.5 py-2.5 font-body text-sm text-correction"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} className="mt-1 h-11 w-full">
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <div className="mt-4">
          <GoogleSignInButton onCredential={onGoogle} onError={setError} />
        </div>

        <p className="mt-5 text-center font-body text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-pen hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
