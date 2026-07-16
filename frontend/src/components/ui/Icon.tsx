import type { CSSProperties } from "react";

/**
 * Small Lucide-derived (MIT) glyph set, embedded inline — flagged substitution
 * per the Lexi design system (the codebase ships no icon system of its own).
 * 1.75 stroke, currentColor, 24-grid.
 */
const PATHS: Record<string, string> = {
  flame:
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  snowflake:
    "M2 12h20|M12 2v20|m20 16-4-4 4-4|m4 8 4 4-4 4|m16 4-4 4-4-4|m8 20 4-4 4 4",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  plus: "M5 12h14|M12 5v14",
  trash: "M3 6h18|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M10 11v6|M14 11v6",
  chevronLeft: "m15 18-6-6 6-6",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  clock: "M12 6v6l4 2",
  layers:
    "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z|m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5|m22 17.5-9.17 4.16a2 2 0 0 1-1.66 0L2 17.5",
  volume: "M11 4.7 6.7 8H3v8h3.7l4.3 3.3zM16 9a5 5 0 0 1 0 6",
  settings:
    "M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.3.5a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.2a2 2 0 0 0-.7 2.7l.3.4a2 2 0 0 0 2.7.8l.2-.2a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.3a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.3a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.2a2 2 0 0 0 2.7-.8l.3-.4a2 2 0 0 0-.8-2.7l-.1-.2a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.1-.1a2 2 0 0 0 .8-2.7l-.3-.5a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z",
  circle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
  sun: "M12 2v2|M12 20v2|m4.93 4.93 1.41 1.41|m17.66 17.66 1.41 1.41|M2 12h2|M20 12h2|m6.34 17.66-1.41 1.41|m19.07 4.93-1.41 1.41",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
  logOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|m16 17 5-5-5-5|M21 12H9",
  menu: "M4 6h16|M4 12h16|M4 18h16",
};

/** Glyphs that need a circle drawn alongside the paths, and its radius. */
const CIRCLE_RADIUS: Record<string, number> = { clock: 10, sun: 4 };

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  style,
  fill,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  fill?: string;
}) {
  const raw = PATHS[name] ?? PATHS.circle;
  const parts = raw.split("|");
  const radius = CIRCLE_RADIUS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }}
      aria-hidden
    >
      {radius ? <circle cx="12" cy="12" r={radius} /> : null}
      {parts.map((d, i) => (
        <path key={i} d={d} fill={fill ?? "none"} />
      ))}
    </svg>
  );
}
