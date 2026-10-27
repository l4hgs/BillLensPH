import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
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
      "inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

    const variantStyles = {
      primary:
        "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md hover:shadow-blue-500/20 active:bg-blue-800",
      secondary:
        "bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100/80 active:bg-blue-200/80",
      outline:
        "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100",
      ghost:
        "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70",
      destructive:
        "bg-rose-500 text-white shadow-sm hover:bg-rose-600 active:bg-rose-700",
    };

    const sizeStyles = {
      sm: "text-xs px-3.5 py-1.5 h-8 gap-1.5",
      md: "text-sm px-5 py-2.5 h-11 gap-2",
      lg: "text-base px-6 py-3.5 h-13 gap-2.5 font-semibold",
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
