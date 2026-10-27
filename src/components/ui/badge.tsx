import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "covered"
    | "review"
    | "out-of-pocket"
    | "primary"
    | "neutral"
    | "outline";
  dot?: boolean;
}

export function Badge({
  className,
  variant = "neutral",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    covered:
      "bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/70",
    review:
      "bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100/70",
    "out-of-pocket":
      "bg-rose-50 text-rose-800 border-rose-200/80 hover:bg-rose-100/70",
    primary:
      "bg-blue-50 text-blue-700 border-blue-200/80 hover:bg-blue-100/70",
    neutral:
      "bg-slate-100 text-slate-700 border-slate-200/70 hover:bg-slate-200/60",
    outline:
      "bg-transparent text-slate-600 border-slate-200 hover:bg-slate-50",
  };

  const dotColors = {
    covered: "bg-emerald-500",
    review: "bg-amber-500",
    "out-of-pocket": "bg-rose-500",
    primary: "bg-blue-600",
    neutral: "bg-slate-400",
    outline: "bg-slate-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant])}
        />
      )}
      {children}
    </span>
  );
}
