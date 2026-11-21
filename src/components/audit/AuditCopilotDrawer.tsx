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
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatPHP } from "@/lib/utils";
import type { AuditEngineResult } from "@/types/audit";

export const STARTER_PROMPTS = [
  "What documents do I need for the Malasakit Center?",
  "Why is this laboratory test flagged yellow?",
  "How much should PhilHealth cover for my doctor's PF?",
] as const;

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
      {/* Responsive Floating Billy Button with Blue Background & Butter-Smooth CSS Grid Expand */}
      <div className="no-print print:hidden fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Ask Billy AI Assistant"
          className="group relative flex cursor-pointer items-center rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] h-12 sm:h-13 text-white shadow-xl shadow-blue-600/35 ring-2 ring-white/25 transition-colors duration-200 active:scale-95"
        >
          {/* Static Anchor Icon - perfectly centered in the 48px/52px circle */}
          <div className="flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center shrink-0">
            <Image
              src="/billy-white.png"
              alt="Billy"
              width={24}
              height={24}
              className="w-5 h-5 sm:w-5.5 sm:h-5.5 object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-xs"
              style={{ width: "auto", height: "auto" }}
            />
          </div>

          {/* Fractional Grid Width Container: 0fr -> 1fr on hover (smooth bidirectional expansion & collapse) */}
          <div className="grid grid-cols-[0fr] group-hover:grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-out">
            <div className="overflow-hidden whitespace-nowrap">
              <span className="block pr-4 sm:pr-4.5 pl-0.5 text-xs sm:text-sm font-bold tracking-tight text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 group-hover:delay-100">
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

      {/* Slide-over / Bottom Sheet Drawer */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-end justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity duration-150 sm:items-stretch"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="chatbot-drawer-title"
              className="relative flex h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-slate-200/80 bg-white shadow-2xl sm:h-full sm:max-w-lg sm:rounded-l-2xl sm:rounded-tr-none sm:border-l sm:border-t-0"
            >
              {/* Clean Light Header matching AI Chatbot Page */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-50/70 p-1 shadow-2xs">
                    <Image
                      src="/billy.png"
                      alt="Billy Logo"
                      width={28}
                      height={28}
                      className="w-6 h-6 object-contain"
                      style={{ width: "auto", height: "auto" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2
                        id="chatbot-drawer-title"
                        className="text-sm font-bold tracking-tight text-slate-900 truncate"
                      >
                        AI Chatbot
                      </h2>
                      <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[10px] font-bold text-blue-700 shrink-0">
                        Billy
                      </span>
                    </div>
                    <p className="line-clamp-1 text-[11px] text-slate-500">
                      {auditResult.hospital_name} ·{" "}
                      <span className="font-mono tabular-nums">{formatPHP(auditResult.gross_total)}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Chatbot drawer"
                  className="cursor-pointer rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Chat Messages Area */}
              <div
                ref={scrollContainerRef}
                className={cn(
                  "flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 scroll-smooth",
                  messages.length === 0 ? "flex flex-col" : "space-y-3.5"
                )}
              >
                {/* Empty State matching AI Chatbot Page */}
                {messages.length === 0 && (
                  <div className="w-full mx-auto my-auto flex flex-col items-center text-center space-y-3 sm:space-y-4 py-1 sm:py-2 transition-opacity duration-150">
                    <div className="relative flex items-center justify-center shrink-0">
                      <Image
                        src="/billy.png"
                        alt="Billy Logo"
                        width={64}
                        height={64}
                        className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow-sm hover:scale-105 transition-transform"
                        style={{ width: "auto", height: "auto" }}
                      />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-bold tracking-tight text-slate-900">
                        Kumusta! I’m Billy, your hospital billing assistant.
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

                    {/* Interactive Starter Cards matching AI Chatbot Page */}
                    <div className="w-full grid grid-cols-1 gap-2.5 pt-1 text-left">
                      {commonQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isStreaming}
                          onClick={() => handleSendQuery(q.prompt)}
                          className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white hover:bg-blue-50/40 p-3.5 text-left shadow-2xs transition-all hover:border-blue-400 hover:shadow-soft active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs transition-colors">
                              {q.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                  {q.title}
                                </span>
                                <span className="text-xs text-slate-300 group-hover:text-blue-500 transition-colors shrink-0">
                                  →
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                {q.desc}
                              </p>
                            </div>
                          </div>
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
                        "flex items-start gap-2.5",
                        isUser ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          isUser
                            ? "bg-[#1E293B] text-white"
                            : "bg-blue-50 border border-blue-200/80 p-0.5 shadow-2xs"
                        )}
                      >
                        {isUser ? (
                          <User className="h-3.5 w-3.5" />
                        ) : (
                          <Image
                            src="/billy.png"
                            alt="Billy"
                            width={20}
                            height={20}
                            className="w-4 h-4 object-contain"
                            style={{ width: "auto", height: "auto" }}
                          />
                        )}
                      </div>

                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs",
                          isUser
                            ? "rounded-tr-sm bg-[#2563EB] text-white"
                            : "rounded-tl-sm border border-[#CBD5E1] bg-[#F3F4F6] text-[#1E293B]"
                        )}
                      >
                        {text ? (
                          <FormattedChatContent content={text} isUser={isUser} />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                            Checking Philippine billing &amp; subsidy rules...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Loading indicator when request is submitted before first assistant chunk */}
                {status === "submitted" && (
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/80 p-0.5 shadow-2xs">
                      <Image
                        src="/billy.png"
                        alt="Billy"
                        width={20}
                        height={20}
                        className="w-4 h-4 object-contain"
                        style={{ width: "auto", height: "auto" }}
                      />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-[#CBD5E1] bg-[#F3F4F6] px-3.5 py-2.5 text-xs text-[#64748B]">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                        Preparing your financial navigation guide...
                      </span>
                    </div>
                  </div>
                )}

                {/* Error Notice */}
                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <div className="flex-1 space-y-1.5">
                        <p className="font-bold">Could not reach AI Chatbot</p>
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
                          className="h-7 px-2.5 text-[11px]"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input & Context Controls Area (Pinned to bottom, matching AI Chatbot Page) */}
              <div className="border-t border-slate-200/80 bg-white p-3 sm:p-3.5 shrink-0 space-y-2.5">
                {/* Top Toolbar: Statement Context Pill, Savings Badge & Clear Chat */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 truncate max-w-[230px]">
                      <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Context:
                      </span>
                      <span className="truncate">
                        {auditResult.hospital_name}
                      </span>
                    </div>

                    {potentialSavings > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 shrink-0">
                        {formatPHP(potentialSavings)} savings
                      </span>
                    )}
                  </div>

                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 shrink-0 px-2.5 py-1 rounded-full hover:bg-rose-50 transition-colors ml-auto"
                      title="Clear conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear chat</span>
                    </button>
                  )}
                </div>

                {/* Input Form */}
                <form
                  onSubmit={handleFormSubmit}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Billy about hospital bills, PhilHealth case rates, or medical discounts..."
                    disabled={isStreaming}
                    className="h-10 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none disabled:opacity-60 transition-colors"
                  />
                  {isStreaming ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => stop()}
                      aria-label="Stop generating"
                      className="h-10 shrink-0 rounded-full px-4 text-xs"
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
                      className="h-10 shrink-0 rounded-full px-5 text-xs font-bold"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Send</span>
                    </Button>
                  )}
                </form>

                <p className="mt-1 flex items-center justify-center gap-1 text-center text-[10px] text-slate-400">
                  <ShieldAlert className="h-3 w-3 shrink-0" />
                  <span>
                    Disclaimer: Guidance is for hospital billing audit and
                    financial assistance navigation only, not formal medical
                    advice.
                  </span>
                </p>
              </div>

              {/* Clear Chat Confirmation Dialog */}
              {showClearConfirm && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="drawer-clear-chat-title"
                  className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
                >
                  <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-4 shadow-xl space-y-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0 shadow-2xs">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <h3
                          id="drawer-clear-chat-title"
                          className="text-xs font-bold text-slate-900"
                        >
                          Clear conversation?
                        </h3>
                        <p className="text-[11px] text-slate-500 leading-snug">
                          Delete all messages from this session.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowClearConfirm(false)}
                        className="rounded-full h-7 px-3 text-[11px] font-semibold"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
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
                        className="rounded-full h-7 px-3 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white border-transparent"
                      >
                        Clear Chat
                      </Button>
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
