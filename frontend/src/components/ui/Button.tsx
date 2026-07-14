import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "default" | "sm";

const variants: Record<Variant, string> = {
  primary: "bg-pen text-white hover:brightness-110 active:brightness-95 shadow-sm",
  secondary:
    "bg-transparent text-ink border border-border hover:border-pen hover:text-pen",
  ghost: "bg-transparent text-ink-soft hover:text-ink hover:bg-ink/[0.03]",
};

const sizes: Record<Size, string> = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-[13px]",
};

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-display font-semibold tracking-tight transition-colors duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen",
        "disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
