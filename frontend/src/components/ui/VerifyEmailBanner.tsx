"use client";

import { useState } from "react";
import { auth as authApi } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * A soft nudge to confirm the signup email. Signup doesn't block on
 * verification, so this reminds — and lets them re-send — until it's done.
 * Hidden for verified accounts and for Google sign-ins (already verified).
 */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user || user.email_verified || user.auth_provider !== "local") return null;

  async function resend() {
    setSending(true);
    try {
      await authApi.resendVerification();
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-b border-highlight/50 bg-highlight-soft">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-6 py-2.5">
        <p className="font-body text-sm text-ink">
          Confirm your email to secure your account — check your inbox for the link.
        </p>
        {sent ? (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-check">
            Sent ✓
          </span>
        ) : (
          <button
            onClick={resend}
            disabled={sending}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-pen underline-offset-2 hover:underline disabled:opacity-50"
          >
            {sending ? "Sending…" : "Resend email"}
          </button>
        )}
      </div>
    </div>
  );
}
