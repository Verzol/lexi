import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * The signature component: a dictionary entry, not a generic "card". The
 * headword is set in the display serif with its pronunciation key alongside;
 * a single ink stroke down the binding edge is the pen that authored it. Every
 * study screen is built around this shape.
 */
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
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-surface shadow-card",
        className
      )}
    >
      {/* the ink margin — one pen stroke down the binding edge */}
      <span className="absolute inset-y-0 left-0 w-[3px] bg-pen" aria-hidden />

      <div className="flex flex-col gap-4 py-6 pl-7 pr-6">
        {tag ? <div className="flex flex-wrap items-center gap-2">{tag}</div> : null}

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-3xl font-semibold tracking-tight text-ink">{term}</h3>
          {ipa ? <span className="font-mono text-sm text-ink-faint">/{ipa}/</span> : null}
        </div>

        <div className="h-px w-full bg-border" aria-hidden />

        <p className="font-display text-lg leading-snug text-ink">{meaning}</p>

        {example ? (
          <p className="font-display text-[15px] italic leading-snug text-ink-soft">
            &ldquo;{example}&rdquo;
          </p>
        ) : null}

        {footer ? <div className="pt-1">{footer}</div> : null}
      </div>
    </article>
  );
}
