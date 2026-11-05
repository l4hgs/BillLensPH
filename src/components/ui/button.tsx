import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "dark"
    | "outline"
    | "ghost"
    | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  pill?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      pill = true,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold whitespace-nowrap shrink-0 transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

    const variantStyles = {
      primary:
        "bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8] hover:shadow-md hover:shadow-blue-500/20 active:bg-blue-800",
      secondary:
        "bg-blue-50 text-[#2563EB] border border-blue-200/70 hover:bg-blue-100/80 active:bg-blue-200/80",
      dark:
        "bg-[#1E293B] text-white shadow-sm hover:bg-slate-800 active:bg-slate-900",
      outline:
        "border border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-[#F3F4F6] hover:border-slate-400 active:bg-slate-100",
      ghost:
        "text-[#64748B] hover:bg-slate-200/60 hover:text-[#1E293B] active:bg-slate-200",
      destructive:
        "bg-[#DC2626] text-white shadow-sm hover:bg-red-700 active:bg-red-800",
    };

    const sizeStyles = {
      sm: "text-xs px-3.5 py-1.5 min-h-[36px] gap-1.5",
      md: "text-xs sm:text-sm px-4 sm:px-5 py-2.5 min-h-[42px] gap-2",
      lg: "text-sm sm:text-base px-5 sm:px-6 py-3 min-h-[48px] gap-2",
      icon: "h-10 w-10 p-0",
    };

    const roundedStyles = pill ? "rounded-full" : "rounded-2xl";

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          roundedStyles,
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
