"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircle,
  Bot,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
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

interface AuditCopilotDrawerProps {
  auditId: string;
  auditResult: AuditEngineResult;
}

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
    id: `copilot-${auditId}`,
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
    auditResult.disputed_overcharge_total + auditResult.senior_pwd_savings;

  // Auto-scroll to bottom when messages stream in
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status, isOpen]);

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
      {/* Floating Ask Copilot Button inside Audit Studio */}
      <div className="fixed bottom-24 right-4 z-40 md:bottom-8 md:right-8">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Health & Subsidy Copilot"
          className="group flex cursor-pointer items-center gap-2.5 rounded-full border border-[#1D4ED8] bg-[#2563EB] px-4 py-3 text-xs font-bold text-white shadow-lg transition-all duration-200 hover:bg-[#1D4ED8] active:scale-[0.98] whitespace-nowrap"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </span>
          <span>Ask Copilot</span>
          {yellowCount > 0 && (
            <span className="rounded-full bg-[#1E293B] px-2 py-0.5 text-[10px] font-extrabold text-white">
              {yellowCount} flagged
            </span>
          )}
        </button>
      </div>

      {/* Slide-over / Bottom Sheet Drawer */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-end justify-end bg-[#1E293B]/60 backdrop-blur-[2px] animate-in fade-in duration-150 sm:items-stretch"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="copilot-drawer-title"
              className="flex h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-[#CBD5E1] bg-[#F3F4F6] shadow-2xl sm:h-full sm:max-w-md sm:rounded-l-3xl sm:rounded-tr-none sm:border-l sm:border-t-0"
            >
              {/* Drawer Header */}
              <div className="border-b border-[#CBD5E1] bg-[#1E293B] px-5 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-white">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2
                          id="copilot-drawer-title"
                          className="text-sm font-extrabold tracking-tight text-white"
                        >
                          BillLens AI Copilot
                        </h2>
                        <span className="rounded-full bg-[#2563EB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          PH Navigator
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-[#CBD5E1]">
                        {auditResult.hospital_name} ·{" "}
                        {formatPHP(auditResult.gross_total)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          stop();
                          setMessages([]);
                          clearError();
                        }}
                        title="Clear conversation"
                        aria-label="Clear conversation"
                        className="cursor-pointer rounded-full p-2 text-[#CBD5E1] transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      aria-label="Close Copilot drawer"
                      className="cursor-pointer rounded-full p-2 text-[#CBD5E1] transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Context Pills */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {auditResult.detected_case_packages.length > 0 ? (
                    auditResult.detected_case_packages.map((pkg) => (
                      <span
                        key={pkg.code}
                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white"
                      >
                        PhilHealth {pkg.code}: {formatPHP(pkg.total_rate)}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#CBD5E1]">
                      General Statutory Audit
                    </span>
                  )}
                  {potentialSavings > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                      {formatPHP(potentialSavings)} potential savings
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Chat Messages Area */}
              <div
                ref={scrollContainerRef}
                className="flex-1 space-y-3.5 overflow-y-auto p-4"
              >
                {/* Welcome Card + Starter Chips */}
                <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB]">
                      <MessageSquareText className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#1E293B]">
                        Kumusta! I’m Billy, your go-to assistant. Feel free to
                        ask about flagged hospital charges, PhilHealth Case Rate
                        rules, Senior/PWD discounts, and Malasakit Center
                        requirements!
                      </p>
                      <p className="text-xs leading-relaxed text-[#64748B]">
                        Ask me about your{" "}
                        <strong className="font-semibold text-[#1E293B]">
                          {yellowCount} yellow-flagged item
                          {yellowCount === 1 ? "" : "s"}
                        </strong>
                        , PhilHealth Case Rate rules, Senior/PWD discounts, or how
                        to apply for{" "}
                        <strong className="font-semibold text-[#1E293B]">
                          Malasakit Center, DSWD, and PCSO
                        </strong>{" "}
                        assistance.
                      </p>
                    </div>
                  </div>

                  {/* Starter Prompt Chips */}
                  <div className="mt-3.5 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                      Suggested Questions
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          disabled={isStreaming}
                          onClick={() => handleSendQuery(prompt)}
                          className="cursor-pointer rounded-xl border border-[#CBD5E1] bg-[#F3F4F6] px-3 py-2 text-left text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#2563EB] hover:bg-white hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

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
                            : "bg-[#2563EB] text-white"
                        )}
                      >
                        {isUser ? (
                          <User className="h-3.5 w-3.5" />
                        ) : (
                          <Bot className="h-3.5 w-3.5" />
                        )}
                      </div>

                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs",
                          isUser
                            ? "rounded-tr-sm bg-[#2563EB] text-white"
                            : "rounded-tl-sm border border-[#CBD5E1] bg-white text-[#1E293B]"
                        )}
                      >
                        {text ? (
                          <FormattedChatContent content={text} isUser={isUser} />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                            Checking your audit statement...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Loading indicator when request is submitted before first assistant chunk */}
                {status === "submitted" && (
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-xs text-[#64748B] shadow-xs">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                        Analyzing your statement &amp; PhilHealth rules...
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
                        <p className="font-bold">Could not reach AI Copilot</p>
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

              {/* Input & Non-Medical Disclaimer Footer */}
              <div className="border-t border-[#CBD5E1] bg-white p-3.5">
                <form
                  onSubmit={handleFormSubmit}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about a charge, PhilHealth, or Malasakit..."
                    disabled={isStreaming}
                    className="h-10 flex-1 rounded-full border border-[#CBD5E1] bg-[#F3F4F6] px-4 text-xs text-[#1E293B] placeholder:text-[#64748B] focus:border-[#2563EB] focus:bg-white focus:outline-none disabled:opacity-60"
                  />
                  {isStreaming ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => stop()}
                      aria-label="Stop generating"
                      className="h-10 shrink-0 rounded-full px-3.5"
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
                      className="h-10 shrink-0 rounded-full px-4"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Ask</span>
                    </Button>
                  )}
                </form>

                <p className="mt-2 flex items-center justify-center gap-1 text-center text-[10px] text-[#64748B]">
                  <ShieldAlert className="h-3 w-3 shrink-0 text-[#64748B]" />
                  <span>
                    Financial &amp; billing audit guidance only — not formal
                    medical advice.
                  </span>
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
