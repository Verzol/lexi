import { cn } from "@/lib/cn";

type Tone = "default" | "correction" | "check";

const toneText: Record<Tone, string> = {
  default: "text-ink",
  correction: "text-correction",
  check: "text-check",
};

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3.5 shadow-sm">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {label}
      </span>
      <span className={cn("font-display text-[28px] font-semibold leading-none", toneText[tone])}>
        {value}
      </span>
      {hint ? <span className="font-body text-xs text-ink-soft">{hint}</span> : null}
    </div>
  );
}
