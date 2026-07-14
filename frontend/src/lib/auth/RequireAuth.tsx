"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Client-side gating is a UX convenience only — it hides the wrong screen from
 * the wrong person. The real authorization boundary is the FastAPI role check
 * on every route; this can be bypassed and that is fine.
 */
export function RequireAuth({
  role,
  children,
}: {
  role: "admin" | "student";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role !== role) router.replace(user.role === "admin" ? "/admin" : "/student");
  }, [loading, user, role, router]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
          Loading…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
