"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { type UIMessage } from "ai";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Send,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { FormattedChatContent } from "@/components/audit/AuditChatbotDrawer";
import { useChatbotBackground } from "@/components/providers/ChatbotBackgroundProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { cn, formatPHP } from "@/lib/utils";

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

export default function ChatbotPage() {
  const {
    messages,
    input,
    setInput,
    status,
    isStreaming,
    error,
    clearError,
    sendQuery,
    stop,
    regenerate,
    clearChat,
    audits,
    selectedAuditId,
    setSelectedAuditId,
    selectedAudit,
    markAsRead,
  } = useChatbotBackground();

  const toast = useToast();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    if (!showClearConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowClearConfirm(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showClearConfirm]);

  const handleSendQuery = async (queryText: string) => {
    await sendQuery(queryText);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendQuery(input);
  };

  const commonQuestions = useMemo(() => {
    if (selectedAudit?.audit_results) {
      const flaggedCount = selectedAudit.audit_results.flags.length;
      const outOfPocket = selectedAudit.audit_results.actual_out_of_pocket;
      return [
        {
          title: "Which line items are flagged for overcharging?",
          desc: `Check ${flaggedCount} flagged item${flaggedCount === 1 ? "" : "s"} against DOH caps & ACR bundled supplies.`,
          prompt: `Which specific line items on my statement from ${selectedAudit.hospital_name} are flagged for overcharging or unbundling?`,
        },
        {
          title: "Did the hospital apply PhilHealth & discounts properly?",
          desc: "Verify statutory order: 12% VAT exemption, 20% Senior/PWD discount, then Case Rates.",
          prompt: `Did ${selectedAudit.hospital_name} deduct my PhilHealth case rate and Senior/PWD discounts in the proper legal sequence?`,
        },
        {
          title: "What requirements do I need for Malasakit Center?",
          desc: `Step-by-step documents to offset remaining ${formatPHP(outOfPocket)} balance.`,
          prompt: `What specific requirements and documents do I need to bring to the Malasakit Center for this statement from ${selectedAudit.hospital_name}?`,
        },
      ];
    }

    return [
      {
        title: "What requirements do I need for the Malasakit Center?",
        desc: "Single-window financial assistance across PhilHealth, PCSO, DSWD, and DOH MAIP.",
        prompt:
          "What requirements and documents do I need to apply for financial assistance at the Malasakit Center?",
      },
      {
        title: "How do Senior Citizen & PWD discounts apply to hospital bills?",
        desc: "Statutory 12% VAT exemption first, 20% discount on remainder, then PhilHealth deduction.",
        prompt:
          "How do Senior Citizen and PWD discounts apply to hospital bills under RA 9994 and RA 10754?",
      },
      {
        title: "Am I covered by No Balance Billing (NBB) in a basic ward?",
        desc: "Zero out-of-pocket co-payment rules for indigent, senior, and sponsored patients.",
        prompt:
          "Am I covered by PhilHealth No Balance Billing (NBB) in a basic hospital ward accommodation?",
      },
    ];
  }, [selectedAudit]);

  return (
    <div className="fixed inset-x-0 top-[60px] sm:top-[68px] bottom-[88px] lg:bottom-0 z-10 flex flex-col px-4 sm:px-6 lg:px-10 xl:px-14 pt-0 pb-3 sm:pb-5 lg:pb-7 bg-[#F8FAFC] overflow-x-hidden">
      {/* Scrollable Conversation Area (No Top Header for Maximum Room) */}
      <div
        ref={scrollContainerRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto scrollbar-none pt-1 pb-4 sm:pb-6 scroll-smooth",
          messages.length === 0 ? "flex flex-col" : "space-y-4"
        )}
      >
        {messages.length === 0 && (
          <div className="w-full max-w-2xl mx-auto my-auto flex flex-col items-center text-center space-y-3.5 sm:space-y-4 pt-0 pb-4 sm:pb-6">
            <div className="relative flex items-center justify-center">
              <Image
                src="/billy.png"
                alt="Billy"
                width={116}
                height={116}
                className="relative animate-billy-entrance motion-reduce:animate-none w-[100px] h-[100px] sm:w-[116px] sm:h-[116px] object-contain"
                priority
              />
            </div>

            <div
              style={{ animationDelay: "120ms" }}
              className="animate-rate-item motion-reduce:animate-none space-y-1.5"
            >
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                Kumusta! I&apos;m Billy, your billing navigator.
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                {selectedAudit?.audit_results
                  ? `Statement from ${selectedAudit.hospital_name} (${formatPHP(
                      selectedAudit.audit_results.gross_total
                    )}) is loaded. Select a starter question or ask anything below.`
                  : "Get clear answers on PhilHealth case rates, Senior/PWD discounts, and Malasakit Center assistance."}
              </p>
            </div>

            {/* Clean Hairline-Divided Starter Prompts (Staggered Reveal) */}
            <div className="w-full divide-y divide-slate-200/80 border-y border-slate-200/80 text-left">
              {commonQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => handleSendQuery(q.prompt)}
                  style={{ animationDelay: `${180 + idx * 80}ms` }}
                  className="animate-rate-item motion-reduce:animate-none group w-full min-h-[44px] py-3 px-2 sm:px-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">
                      {q.title}
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug">
                      {q.desc}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const text = getMessageText(msg);
          if (!text && !isStreaming) return null;

          return (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-2.5 max-w-4xl mx-auto w-full motion-reduce:animate-none",
                isUser ? "flex-row-reverse animate-msg-user" : "flex-row animate-msg-billy"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5",
                  isUser
                    ? "bg-slate-900 text-white"
                    : "bg-blue-50 border border-blue-200/80 p-0.5"
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
                  "max-w-[85%] sm:max-w-3xl min-w-0 break-words rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed",
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
                    className="inline-flex items-center gap-1.5 text-slate-500 text-xs"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                    <span>Checking Philippine billing &amp; subsidy rules...</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {status === "submitted" && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2.5 max-w-4xl mx-auto w-full"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 border border-blue-200/80 p-0.5 mt-0.5">
              <Image
                src="/billy.png"
                alt="Billy"
                width={20}
                height={20}
                className="w-4 h-4 object-contain"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-slate-200/80 bg-white px-4 py-2.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                <span>Preparing your financial navigation guide...</span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="max-w-4xl mx-auto w-full border-l-2 border-rose-500 bg-rose-50/70 pl-3.5 pr-3 py-2.5 text-xs text-rose-800"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div className="flex-1 space-y-1.5">
                <p className="font-bold text-rose-900">
                  Could not reach AI Chatbot
                </p>
                <p className="text-[11px] leading-relaxed">
                  {error.message || "Please try again."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => regenerate()}
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

      {/* Pinned Bottom Bar: Context Row Above Input + Open Studio at Upper Right */}
      <div className="shrink-0 border-t border-slate-200/80 pt-2.5 space-y-2">
        {(audits.length > 0 || selectedAudit || messages.length > 0) && (
          <div className="flex items-center justify-between gap-2 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {audits.length > 0 && (
                <SelectMenu
                  id="chatbot-bill-select"
                  value={selectedAuditId}
                  onChange={setSelectedAuditId}
                  ariaLabel="Statement context"
                  placement="top"
                  icon={<Building2 className="h-3.5 w-3.5 text-[#2563EB]" />}
                  className="min-w-0 flex-1 sm:max-w-[300px]"
                  menuClassName="min-w-[260px] sm:min-w-[320px]"
                  options={[
                    { value: "", label: "General PH Billing Mode" },
                    ...audits.map((a) => ({
                      value: a.id,
                      label: `${a.hospital_name} (${
                        a.total_billed > 0 ? formatPHP(a.total_billed) : "Draft"
                      })`,
                    })),
                  ]}
                />
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="inline-flex cursor-pointer items-center gap-1 min-h-[44px] min-w-[44px] justify-center px-2.5 rounded-full text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Clear chat</span>
                </button>
              )}

              {selectedAudit && (
                <Link
                  href={`/audits/${selectedAudit.id}`}
                  className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-xs font-semibold text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-lg whitespace-nowrap"
                >
                  <span>Open Studio</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={handleFormSubmit}
          className="flex items-center gap-2 max-w-4xl mx-auto w-full"
        >
          <input
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
              className="min-h-[44px] shrink-0 rounded-full px-5 text-xs font-bold"
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
              className="min-h-[44px] shrink-0 rounded-full px-5 text-xs font-bold"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </Button>
          )}
        </form>

        <p className="text-center text-[10px] sm:text-[11px] text-slate-400">
          Guidance is for hospital billing audit and financial assistance
          navigation only, not formal medical or legal advice.
        </p>
      </div>

      {/* Clear Chat Confirmation Modal (Portal, NO backdrop-blur, Escape key supported) */}
      {showClearConfirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-chat-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6 transition-opacity duration-150 motion-reduce:transition-none"
            onClick={() => setShowClearConfirm(false)}
          >
            <div
              className="animate-fade-slide-in motion-reduce:animate-none relative w-full max-w-sm bg-white rounded-2xl border border-slate-200/90 shadow-xl p-5 sm:p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h3
                    id="clear-chat-title"
                    className="text-base font-extrabold tracking-tight text-slate-900"
                  >
                    Clear conversation?
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    This will remove all messages from your current Billy session.
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
                    clearChat();
                    clearError();
                    setShowClearConfirm(false);
                    toast.info("Conversation cleared");
                  }}
                  className="min-h-[44px] px-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                >
                  Clear Chat
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
