"use client";

import { cn } from "@/lib/cn";

const GRADES = [
  { key: "again", label: "Again", tint: "var(--correction)", tintSoft: "var(--correction-soft)" },
  { key: "hard", label: "Hard", tint: "var(--highlight)", tintSoft: "color-mix(in srgb, var(--highlight) 22%, transparent)" },
  { key: "good", label: "Good", tint: "var(--pen)", tintSoft: "var(--pen-soft)" },
  { key: "easy", label: "Easy", tint: "var(--check)", tintSoft: "var(--check-soft)" },
] as const;

export type Grade = (typeof GRADES)[number]["key"];

export function GradeButtons({
  onGrade,
  className,
}: {
  onGrade?: (grade: Grade) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {GRADES.map((g) => (
        <button
          key={g.key}
          onClick={() => onGrade?.(g.key)}
          style={{ borderColor: g.tint, color: g.tint, backgroundColor: g.tintSoft }}
          className={cn(
            "rounded-md border-2 px-2 py-2.5 font-mono text-[11px] font-bold uppercase tracking-wider",
            "transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-95",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
