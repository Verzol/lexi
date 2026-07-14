import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Flashcard({
  term,
  ipa,
  meaning,
  example,
  tag,
  footer,
  className,
}: {
  term: string;
  ipa?: string;
  meaning: string;
  example?: string;
  tag?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-surface shadow-card",
        // punched hole
        "before:content-[''] before:absolute before:left-5 before:top-5 before:h-3.5 before:w-3.5 before:rounded-full before:border before:border-border before:bg-paper before:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]",
        // folded corner
        "after:content-[''] after:absolute after:right-0 after:top-0 after:h-7 after:w-7 after:[clip-path:polygon(100%_0,0_0,100%_100%)] after:bg-gradient-to-br after:from-black/5 after:to-black/20",
        className
      )}
    >
      {/* margin rule */}
      <div className="absolute bottom-4 left-11 top-4 w-px bg-correction/25" aria-hidden />

      <div className="flex flex-col gap-3 py-6 pl-16 pr-6">
        {tag ? <div>{tag}</div> : null}

        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-2xl font-bold tracking-tight text-ink">{term}</h3>
          {ipa ? <span className="font-mono text-sm text-ink-faint">/{ipa}/</span> : null}
        </div>

        <p className="font-body text-[15px] leading-snug text-ink-soft">{meaning}</p>

        {example ? (
          <p className="font-body text-sm italic leading-snug text-ink-faint">“{example}”</p>
        ) : null}

        {footer ? <div className="pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}
