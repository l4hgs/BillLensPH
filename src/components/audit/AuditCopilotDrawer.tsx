"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  FileText,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatPHP } from "@/lib/utils";
import type { AuditEngineResult } from "@/types/audit";

export interface AuditCopilotDrawerProps {
  auditId: string;
  auditResult: AuditEngineResult;
}

export type AuditChatbotDrawerProps = AuditCopilotDrawerProps;

function getMessageText(message: UIMessage): string {
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("");
}

/**
 * Lightweight inline formatter for **bold** and *italic* spans inside chat messages.
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return (
        <strong key={idx} className="font-bold text-[#1E293B]">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      return (
        <em key={idx} className="italic text-[#64748B]">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

/**
 * Cleanly formats assistant markdown responses (paragraphs, bullet lists, numbered steps)
 * for mobile legibility without external markdown dependencies.
 */
export function FormattedChatContent({
  content,
  isUser = false,
}: {
  content: string;
  isUser?: boolean;
}) {
  if (isUser) {
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>;
  }

  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = (keyPrefix: string) => {
    if (!currentList) return;
    if (currentList.type === "ul") {
      blocks.push(
        <ul
          key={`${keyPrefix}-ul`}
          className="my-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#1E293B]"
        >
          {currentList.items.map((item, i) => (
            <li key={i}>{renderInlineFormatting(item)}</li>
          ))}
        </ul>
      );
    } else {
      blocks.push(
        <ol
          key={`${keyPrefix}-ol`}
          className="my-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-[#1E293B]"
        >
          {currentList.items.map((item, i) => (
            <li key={i}>{renderInlineFormatting(item)}</li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`empty-${index}`);
      return;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (currentList?.type !== "ul") {
        flushList(`switch-ul-${index}`);
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      return;
    }

    const numberedMatch = line.match(/^\d+[.)]\s+(.*)$/);
    if (numberedMatch) {
      if (currentList?.type !== "ol") {
        flushList(`switch-ol-${index}`);
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(numberedMatch[1]);
      return;
    }

    flushList(`line-${index}`);

    if (line.startsWith("### ") || line.startsWith("## ")) {
      const headingText = line.replace(/^#{2,3}\s+/, "");
      blocks.push(
        <h4
          key={`h-${index}`}
          className="mt-2 text-xs font-extrabold tracking-tight text-[#1E293B]"
        >
          {renderInlineFormatting(headingText)}
        </h4>
      );
      return;
    }

    blocks.push(
      <p key={`p-${index}`} className="text-xs leading-relaxed text-[#1E293B]">
        {renderInlineFormatting(line)}
      </p>
    );
  });

  flushList("final");

  return <div className="space-y-2">{blocks}</div>;
}

export function AuditCopilotDrawer({
  auditId,
  auditResult,
}: AuditCopilotDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimatingOpen, setIsAnimatingOpen] = useState(false);
  const [input, setInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/audit/chat",
      }),
    []
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    regenerate,
    setMessages,
    clearError,
  } = useChat({
    id: `chatbot-${auditId}`,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  const yellowCount = useMemo(
    () =>
      auditResult.line_items.filter((item) => item.status === "review_worthy")
        .length,
    [auditResult.line_items]
  );

  const potentialSavings =
    auditResult.disputed_overcharge_total +
    auditResult.senior_pwd_savings +
    (auditResult.case_rate_shortfall ?? 0) +
    (auditResult.nbb_savings ?? 0) +
    Math.max(0, auditResult.arithmetic_discrepancy ?? 0);

  const commonQuestions = useMemo(
    () => [
      {
        title: "Which line items are flagged for overcharging?",
        desc: `Check ${yellowCount} flagged item${yellowCount === 1 ? "" : "s"} against DOH caps & ACR bundled supplies.`,
        prompt: `Which specific line items on my statement from ${auditResult.hospital_name} are flagged for overcharging or unbundling?`,
        icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
      },
      {
        title: "Did the hospital apply PhilHealth & discounts properly?",
        desc: "Verify statutory order: 12% VAT exemption, 20% Senior/PWD discount, then Case Rates.",
        prompt: `Did ${auditResult.hospital_name} deduct my PhilHealth case rate and Senior/PWD discounts in the proper legal sequence?`,
        icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      },
      {
        title: "What requirements do I need for Malasakit Center?",
        desc: `Step-by-step documents to offset remaining ${formatPHP(auditResult.actual_out_of_pocket)} balance.`,
        prompt: `What specific requirements and documents do I need to bring to the Malasakit Center for this statement from ${auditResult.hospital_name}?`,
        icon: <FileText className="h-4 w-4 text-blue-600" />,
      },
    ],
    [
      yellowCount,
      auditResult.hospital_name,
      auditResult.actual_out_of_pocket,
    ]
  );

  // Auto-scroll to bottom when messages stream in
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status, isOpen]);

  // Restore messages from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined" || !auditId) return;
    try {
      const raw = localStorage.getItem(`billlens_drawer_chat_${auditId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // Fallback
    }
  }, [auditId, setMessages]);

  // Persist messages to localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !auditId) return;
    try {
      if (messages.length > 0) {
        localStorage.setItem(
          `billlens_drawer_chat_${auditId}`,
          JSON.stringify(messages)
        );
      }
    } catch {
      // Fallback
    }
  }, [messages, auditId]);

  // Warn before closing tab while streaming in drawer
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isStreaming) {
        e.preventDefault();
        e.returnValue =
          "Billy is currently responding to your query. Closing will terminate the response.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isStreaming]);

  // Coordinate mount/unmount with enter/exit transitions so backdrop dimming and slide/origin animations play smoothly
  useEffect(() => {
    if (isOpen) {
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        setShouldRender(true);
        raf2 = requestAnimationFrame(() => {
          setIsAnimatingOpen(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    let timer = 0;
    const raf = requestAnimationFrame(() => {
      setIsAnimatingOpen(false);
      timer = window.setTimeout(() => {
        setShouldRender(false);
      }, 300);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  // Lock body scroll and focus input when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const handleSendQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    clearError();
    await sendMessage(
      { text: trimmed },
      {
        body: {
          audit_id: auditId,
          audit_snapshot: auditResult,
        },
      }
    );
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSendQuery(input);
  };

  return (
    <>
      {/* Responsive Floating Billy Button: Shows "Ask Billy" by default on mobile/tablet, expands on hover on desktop */}
      <div
        className={cn(
          "no-print print:hidden fixed bottom-24 lg:bottom-6 right-4 lg:right-6 z-40 transition-all duration-200 ease-out motion-reduce:transition-none",
          isOpen
            ? "scale-75 opacity-0 pointer-events-none"
            : "scale-100 opacity-100"
        )}
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Ask Billy AI Assistant"
          className="group relative flex cursor-pointer items-center rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] h-11 sm:h-12 lg:h-13 text-white shadow-xl shadow-blue-600/35 ring-2 ring-white/25 transition-colors duration-200 active:scale-95"
        >
          {/* Static Anchor Icon */}
          <div className="flex h-11 w-11 sm:h-12 sm:w-12 lg:h-13 lg:w-13 items-center justify-center shrink-0">
            <Image
              src="/billy-white.png"
              alt="Billy"
              width={24}
              height={24}
              className="h-5 w-auto lg:h-[22px] object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-xs"
            />
          </div>

          {/* Always visible on mobile/tablet (< lg); hover-expand on desktop (lg+) */}
          <div className="grid grid-cols-[1fr] lg:grid-cols-[0fr] lg:group-hover:grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-out">
            <div className="overflow-hidden whitespace-nowrap">
              <span className="block pr-3.5 sm:pr-4 lg:pr-4.5 pl-0.5 text-xs lg:text-sm font-bold tracking-tight text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 lg:group-hover:delay-100">
                Ask Billy
              </span>
            </div>
          </div>

          {/* Minimal Status / Unbundled items count badge */}
          {yellowCount > 0 && (
            <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 flex items-center justify-center min-w-[19px] h-[19px] px-1 rounded-full bg-[#0F172A] text-[10px] font-black text-white shadow-md ring-2 ring-white leading-none tabular-nums z-10">
              {yellowCount}
            </span>
          )}
        </button>
      </div>

      {/* Slide-over / Bottom Sheet Drawer originating from bottom-right FAB */}
      {shouldRender &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={cn(
              "no-print print:hidden fixed inset-0 z-[110] flex items-end justify-end bg-slate-950/75 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:items-stretch",
              isAnimatingOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="chatbot-drawer-title"
              className={cn(
                "relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl sm:h-full sm:max-w-lg sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0 origin-bottom-right transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                isAnimatingOpen
                  ? "translate-x-0 translate-y-0 scale-100 opacity-100"
                  : "translate-y-12 translate-x-4 scale-[0.86] opacity-0 sm:translate-y-8 sm:translate-x-10 sm:scale-[0.88]"
              )}
            >
              {/* Minimal Top Bar */}
              <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-2.5 sm:px-5">
                <h2
                  id="chatbot-drawer-title"
                  className="text-sm font-extrabold tracking-tight text-slate-900"
                >
                  Ask Billy
                </h2>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Chatbot drawer"
                  className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center cursor-pointer rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Chat Messages Area */}
              <div
                ref={scrollContainerRef}
                className={cn(
                  "flex-1 min-h-0 overflow-y-auto scrollbar-none p-4 sm:p-5 scroll-smooth",
                  messages.length === 0 ? "flex flex-col" : "space-y-4"
                )}
              >
                {/* Empty State matching AI Chatbot Page */}
                {messages.length === 0 && (
                  <div className="w-full mx-auto my-auto flex flex-col items-center text-center space-y-3.5 sm:space-y-4 py-2">
                    <Image
                      src="/billy.png"
                      alt="Billy"
                      width={96}
                      height={96}
                      className="w-[84px] h-[84px] sm:w-24 sm:h-24 object-contain"
                    />

                    <div className="space-y-1">
                      <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900">
                        Kumusta! I&apos;m Billy, your billing navigator.
                      </h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        Statement from{" "}
                        <strong className="font-semibold text-slate-700">
                          {auditResult.hospital_name}
                        </strong>{" "}
                        ({formatPHP(auditResult.gross_total)}) is loaded. Pick a
                        question below or ask anything about your bill.
                      </p>
                    </div>

                    {/* Hairline-Divided Starter Prompts matching AI Chatbot Page */}
                    <div className="w-full divide-y divide-slate-200/80 border-y border-slate-200/80 text-left">
                      {commonQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isStreaming}
                          onClick={() => handleSendQuery(q.prompt)}
                          className="group w-full min-h-[44px] py-3 px-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors motion-reduce:transition-none disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-lg"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">
                              {q.title}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                              {q.desc}
                            </p>
                          </div>
                          <span className="text-xs text-slate-400 group-hover:text-[#2563EB] shrink-0">
                            →
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversation Thread */}
                {messages.map((msg) => {
                  const isUser = msg.role === "user";
                  const text = getMessageText(msg);
                  if (!text && !isStreaming) return null;

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex items-start",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed",
                          isUser
                            ? "rounded-tr-sm bg-[#2563EB] text-white"
                            : "rounded-tl-sm border border-slate-200/80 bg-white text-slate-900"
                        )}
                      >
                        {text ? (
                          <FormattedChatContent content={text} isUser={isUser} />
                        ) : (
                          <span
                            role="status"
                            aria-live="polite"
                            className="inline-flex items-center gap-1.5 text-slate-500"
                          >
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                            <span>Checking Philippine billing &amp; subsidy rules...</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Loading indicator when request is submitted before first assistant chunk */}
                {status === "submitted" && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-start justify-start"
                  >
                    <div className="rounded-2xl rounded-tl-sm border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                        <span>Preparing your financial navigation guide...</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Error Notice */}
                {error && (
                  <div
                    role="alert"
                    className="border-l-2 border-rose-500 bg-rose-50/70 pl-3.5 pr-3 py-2.5 text-xs text-rose-800"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <div className="flex-1 space-y-1.5">
                        <p className="font-bold text-rose-900">
                          Could not reach AI Chatbot
                        </p>
                        <p className="text-[11px] leading-relaxed">
                          {error.message ||
                            "Please check your connection or try again."}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            regenerate({
                              body: {
                                audit_id: auditId,
                                audit_snapshot: auditResult,
                              },
                            })
                          }
                          className="min-h-[36px] px-3 text-xs"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Retry</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pinned Bottom Composer matching AI Chatbot Page */}
              <div className="border-t border-slate-200/80 bg-white p-3 sm:p-4 shrink-0 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 text-slate-600">
                    <Building2 className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                    <span className="font-semibold truncate">
                      {auditResult.hospital_name}
                    </span>
                    {potentialSavings > 0 && (
                      <span className="text-[11px] font-semibold text-amber-700 shrink-0">
                        · {formatPHP(potentialSavings)} savings
                      </span>
                    )}
                  </div>

                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="inline-flex cursor-pointer items-center gap-1 min-h-[36px] px-2.5 rounded-full text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50/70 transition-colors shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Clear chat</span>
                    </button>
                  )}
                </div>

                <form
                  onSubmit={handleFormSubmit}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Billy about hospital bills, PhilHealth case rates, or discounts..."
                    aria-label="Message Billy"
                    disabled={isStreaming}
                    className="min-h-[44px] flex-1 rounded-full border border-slate-200/90 bg-white px-4 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-60 transition-colors"
                  />
                  {isStreaming ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => stop()}
                      aria-label="Stop generating"
                      className="min-h-[44px] shrink-0 rounded-full px-4 text-xs font-bold"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span>Stop</span>
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!input.trim()}
                      aria-label="Send question"
                      className="min-h-[44px] shrink-0 rounded-full px-5 text-xs font-bold"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Send</span>
                    </Button>
                  )}
                </form>

                <p className="text-center text-[10px] text-slate-400">
                  Guidance is for hospital billing audit and financial assistance
                  navigation only, not formal medical or legal advice.
                </p>
              </div>

              {/* Clear Chat Confirmation Dialog (NO backdrop-blur, matching existing modals) */}
              {showClearConfirm && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="drawer-clear-chat-title"
                  className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
                  onClick={() => setShowClearConfirm(false)}
                >
                  <div
                    className="animate-fade-slide-in motion-reduce:animate-none w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white shadow-xl p-5 sm:p-6 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3
                          id="drawer-clear-chat-title"
                          className="text-base font-extrabold tracking-tight text-slate-900"
                        >
                          Clear conversation?
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                          This will remove all messages from this session.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close confirmation dialog"
                        onClick={() => setShowClearConfirm(false)}
                        className="min-w-[44px] min-h-[44px] -mt-2 -mr-2 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(false)}
                        className="min-h-[44px] px-4 rounded-full border border-slate-200/90 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stop();
                          setMessages([]);
                          clearError();
                          if (typeof window !== "undefined" && auditId) {
                            try {
                              localStorage.removeItem(
                                `billlens_drawer_chat_${auditId}`
                              );
                            } catch {
                              // Fallback
                            }
                          }
                          setShowClearConfirm(false);
                        }}
                        className="min-h-[44px] px-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                      >
                        Clear Chat
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export const AuditChatbotDrawer = AuditCopilotDrawer;
