"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, auth as authApi } from "@/lib/api/client";

type State = "verifying" | "ok" | "error";

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    Promise.resolve(token)
      .then((t) => {
        if (!t) throw new ApiError(400, "This link is missing its confirmation token.");
        return authApi.verifyEmail(t);
      })
      .then(() => setState("ok"))
      .catch((err) => {
        setState("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "Could not reach the server. Is the API running?"
        );
      });
  }, []);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <span className="font-display text-3xl font-semibold tracking-tight text-pen">
          Lexi<span className="text-correction">.</span>
        </span>

        {state === "verifying" && (
          <p className="mt-6 font-body text-[15px] text-ink-soft">Confirming your email…</p>
        )}

        {state === "ok" && (
          <>
            <h1 className="mt-6 font-display text-xl font-semibold tracking-tight text-ink">
              Email confirmed
            </h1>
            <p className="mt-1 font-body text-[15px] text-ink-soft">
              Your account is all set. Back to studying.
            </p>
            <Link href="/student" className="mt-5 inline-block">
              <Button className="h-11 px-6">Go to Lexi</Button>
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="mt-6 font-display text-xl font-semibold tracking-tight text-ink">
              Couldn&rsquo;t confirm
            </h1>
            <p className="mt-1 font-body text-[15px] text-ink-soft">{message}</p>
            <p className="mt-5 font-body text-sm text-ink-soft">
              You can request a fresh link from{" "}
              <Link href="/student" className="font-semibold text-pen hover:underline">
                your home screen
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
