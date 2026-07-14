import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type Tone = "pen" | "check" | "correction" | "neutral";

const tones: Record<Tone, string> = {
  pen: "bg-pen-soft text-pen",
  check: "bg-check-soft text-check",
  correction: "bg-correction-soft text-correction",
  neutral: "bg-ink/[0.04] text-ink-soft",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
