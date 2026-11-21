"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectMenuOption {
  value: string;
  label: string;
}

export interface SelectMenuProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  ariaLabel?: string;
  placement?: "top" | "bottom";
  icon?: React.ReactNode;
  className?: string;
  menuClassName?: string;
}

/**
 * Accessible custom dropdown menu matching the BillLens PH Plus Jakarta Sans editorial UI,
 * replacing unstyled native <select> popups.
 */
export function SelectMenu({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placement = "bottom",
  icon,
  className,
  menuClassName,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption =
    options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-full min-h-[44px] rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-left text-xs sm:text-sm font-semibold text-slate-900 flex items-center justify-between gap-2 cursor-pointer transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]",
          open && "border-[#2563EB] ring-2 ring-[#2563EB]/20"
        )}
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="truncate">{selectedOption?.label ?? ""}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180 text-[#2563EB]"
          )}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute left-0 right-0 z-50 max-h-60 overflow-y-auto scrollbar-none rounded-xl border border-slate-200 bg-white py-1 shadow-xl font-sans",
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            menuClassName
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full min-h-[40px] px-3 py-2 text-left text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors",
                    isSelected
                      ? "bg-blue-50/70 text-[#2563EB] font-bold"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium"
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
