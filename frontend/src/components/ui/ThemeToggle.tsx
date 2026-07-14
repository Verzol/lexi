"use client";

import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <button
      onClick={toggle}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-ink-soft transition-colors hover:border-pen hover:text-pen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen ${className ?? ""}`}
    >
      <Icon name={resolved === "dark" ? "sun" : "moon"} size={16} />
    </button>
  );
}
