"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface ToastOptions {
  id?: string;
  title: string;
  variant?: ToastVariant;
  /** Duration in ms; defaults to 3500ms for non-errors, 0 (manual dismiss) for errors. */
  duration?: number;
  action?: ToastAction;
}

interface ToastItem extends Required<Pick<ToastOptions, "id" | "title" | "variant" | "duration">> {
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  success: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => string;
  info: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => string;
  warning: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => string;
  error: (title: string, options?: Omit<ToastOptions, "title" | "variant">) => string;
  dismiss: (id: string) => void;
}

const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION_MS = 3500;

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_DOT: Record<ToastVariant, string> = {
  success: "bg-emerald-500",
  info: "bg-[#2563EB]",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

function ToastRow({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const remainingRef = useRef<number>(item.duration);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (item.duration <= 0) return;
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      onDismiss(item.id);
    }, Math.max(0, remainingRef.current));
  }, [clearTimer, item.duration, item.id, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (item.duration <= 0 || timerRef.current === null) return;
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    clearTimer();
  }, [clearTimer, item.duration]);

  useEffect(() => {
    remainingRef.current = item.duration;
    startTimer();
    return clearTimer;
  }, [clearTimer, item.duration, startTimer]);

  const isError = item.variant === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
      onFocus={pauseTimer}
      onBlur={startTimer}
      className="pointer-events-auto animate-fade-slide-in motion-reduce:animate-none flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white pl-3.5 pr-1.5 py-1.5 text-slate-900 shadow-lg"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1 py-1">
        <span
          aria-hidden="true"
          className={cn("h-2 w-2 rounded-full shrink-0", VARIANT_DOT[item.variant])}
        />
        <p className="text-xs font-semibold text-slate-900 leading-snug truncate">
          {item.title}
        </p>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {item.action &&
          (item.action.href ? (
            <Link
              href={item.action.href}
              onClick={() => {
                item.action?.onClick?.();
                onDismiss(item.id);
              }}
              className="min-h-[44px] px-2.5 inline-flex items-center text-xs font-bold text-[#2563EB] hover:underline rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {item.action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick?.();
                onDismiss(item.id);
              }}
              className="min-h-[44px] px-2.5 inline-flex items-center text-xs font-bold text-[#2563EB] hover:underline cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
            >
              {item.action.label}
            </button>
          ))}

        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          aria-label="Dismiss notification"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions): string => {
    const variant: ToastVariant = options.variant ?? "info";
    const id =
      options.id ??
      `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration =
      options.duration !== undefined
        ? options.duration
        : variant === "error"
          ? 0
          : DEFAULT_DURATION_MS;

    setToasts((prev) => {
      const deduped = prev.filter((t) => t.id !== id);
      const next = [...deduped, { id, title: options.title, variant, duration, action: options.action }];
      return next.slice(-MAX_VISIBLE_TOASTS);
    });
    return id;
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToasts((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toasts.length]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, opts) => toast({ ...opts, title, variant: "success" }),
      info: (title, opts) => toast({ ...opts, title, variant: "info" }),
      warning: (title, opts) => toast({ ...opts, title, variant: "warning" }),
      error: (title, opts) => toast({ ...opts, title, variant: "error" }),
      dismiss,
    }),
    [dismiss, toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-label="Notifications"
          className="no-print print:hidden fixed z-[120] top-[72px] sm:top-[80px] lg:top-auto lg:bottom-24 right-4 left-4 sm:left-auto sm:w-full sm:max-w-sm flex flex-col gap-2 pointer-events-none"
        >
          {toasts.map((item) => (
            <ToastRow key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
