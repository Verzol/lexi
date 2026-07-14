"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth/AuthProvider";

export function SignOutButton({
  label = true,
  className,
}: {
  /** Show the "Sign out" text next to the glyph. */
  label?: boolean;
  className?: string;
}) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      // Clears the httpOnly refresh cookie server-side, then drops the in-memory
      // access token. RequireAuth sees the empty user and routes to /login.
      await logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title="Sign out"
      aria-label="Sign out"
      className={`flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2 font-display text-[13px] font-semibold text-ink-soft transition-colors hover:border-correction hover:text-correction focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen disabled:opacity-40 ${className ?? ""}`}
    >
      <Icon name="logOut" size={15} />
      {label ? <span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span> : null}
    </button>
  );
}
