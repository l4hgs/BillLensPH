"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircle,
  AlertTriangle,
  Bed,
  Bot,
  Building2,
  ExternalLink,
  FileText,
  Loader2,
  Percent,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedChatContent } from "@/components/audit/AuditChatbotDrawer";
import { createClient } from "@/lib/supabase/client";
import { cn, formatPHP } from "@/lib/utils";
import type { AuditEngineResult } from "@/types/audit";

interface AuditOption {
  id: string;
  hospital_name: string;
  total_billed: number;
  created_at: string;
  audit_results: AuditEngineResult | null;
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

export default function ChatbotPage() {
  const supabase = useMemo(() => createClient(), []);
  const [audits, setAudits] = useState<AuditOption[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string>("");
  const [input, setInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("audits")
        .select("id, hospital_name, total_billed, created_at, audit_results")
        .order("created_at", { ascending: false })
        .limit(15);

      if (cancelled || !data) return;

      const mapped: AuditOption[] = data.map((row) => ({
        id: row.id,
        hospital_name: row.hospital_name || "Philippine Healthcare Institution",
        total_billed: Number(row.total_billed) || 0,
        created_at: row.created_at,
        audit_results:
          row.audit_results &&
          typeof row.audit_results === "object" &&
          Array.isArray((row.audit_results as unknown as AuditEngineResult).line_items)
            ? (row.audit_results as unknown as AuditEngineResult)
            : null,
      }));

      setAudits(mapped);
      const firstAnalyzed = mapped.find((a) => a.audit_results !== null);
      if (firstAnalyzed) {
        setSelectedAuditId(firstAnalyzed.id);
      } else if (mapped[0]) {
        setSelectedAuditId(mapped[0].id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const selectedAudit = useMemo(
    () => audits.find((a) => a.id === selectedAuditId) ?? null,
    [audits, selectedAuditId]
  );

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
    id: `standalone-chatbot-${selectedAuditId || "general"}`,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  const handleSendQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    clearError();
    await sendMessage(
      { text: trimmed },
      {
        body: {
          audit_id: selectedAudit?.id || undefined,
          audit_snapshot: selectedAudit?.audit_results || undefined,
        },
      }
    );
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSendQuery(input);
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
          icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
        },
        {
          title: "Did the hospital apply PhilHealth & discounts properly?",
          desc: "Verify statutory order: 12% VAT exemption, 20% Senior/PWD discount, then Case Rates.",
          prompt: `Did ${selectedAudit.hospital_name} deduct my PhilHealth case rate and Senior/PWD discounts in the proper legal sequence?`,
          icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
        },
        {
          title: "What requirements do I need for Malasakit Center?",
          desc: `Step-by-step documents to offset remaining ${formatPHP(outOfPocket)} balance.`,
          prompt: `What specific requirements and documents do I need to bring to the Malasakit Center for this statement from ${selectedAudit.hospital_name}?`,
          icon: <FileText className="w-4 h-4 text-blue-600" />,
        },
      ];
    }

    return [
      {
        title: "What requirements do I need for the Malasakit Center?",
        desc: "Single-window financial assistance across PhilHealth, PCSO, DSWD, and DOH MAIP.",
        prompt: "What requirements and documents do I need to apply for financial assistance at the Malasakit Center?",
        icon: <FileText className="w-4 h-4 text-blue-600" />,
      },
      {
        title: "How do Senior Citizen & PWD discounts apply to hospital bills?",
        desc: "Statutory 12% VAT exemption first, 20% discount on remainder, then PhilHealth deduction.",
        prompt: "How do Senior Citizen and PWD discounts apply to hospital bills under RA 9994 and RA 10754?",
        icon: <Percent className="w-4 h-4 text-purple-600" />,
      },
      {
        title: "Am I covered by No Balance Billing (NBB) in a basic ward?",
        desc: "Zero out-of-pocket co-payment rules for indigent, senior, and sponsored patients.",
        prompt: "Am I covered by PhilHealth No Balance Billing (NBB) in a basic hospital ward accommodation?",
        icon: <Bed className="w-4 h-4 text-emerald-600" />,
      },
    ];
  }, [selectedAudit]);

  return (
    <div className="w-full max-w-5xl mx-auto h-[calc(100dvh-5.5rem)] md:h-[calc(100dvh-6rem)] flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-soft overflow-hidden">
      {/* Messages Viewport - ONLY THIS SCROLLS */}
      <div
        ref={scrollContainerRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 scroll-smooth",
          messages.length === 0
            ? "flex flex-col items-center justify-center"
            : "space-y-3.5"
        )}
      >
        {messages.length === 0 && (
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center space-y-4 py-2 sm:py-3 transition-opacity duration-150">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shadow-soft">
              <Bot className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                Kumusta! I’m Billy, your hospital billing assistant.
              </h2>
              <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
                {selectedAudit?.audit_results
                  ? `Statement from ${selectedAudit.hospital_name} (${formatPHP(
                      selectedAudit.audit_results.gross_total
                    )}) is loaded. Pick a question below or ask anything about your bill.`
                  : "Get immediate answers on PhilHealth case rates, Senior/PWD discounts, and financial assistance. Choose a common question below or type your own."}
              </p>
            </div>

            {/* Horizontal Options Grid (Left to Right) */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-2 text-left">
              {commonQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => handleSendQuery(q.prompt)}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white hover:bg-blue-50/40 p-3.5 sm:p-4 text-left shadow-2xs transition-all hover:border-blue-400 hover:shadow-soft active:scale-[0.99] disabled:opacity-50 cursor-pointer min-h-[120px]"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs transition-colors">
                        {q.icon}
                      </div>
                      <span className="text-xs text-slate-300 group-hover:text-blue-500 transition-colors">
                        →
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2">
                        {q.title}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-snug">
                        {q.desc}
                      </div>
                    </div>
                  </div>
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

        {status === "submitted" && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-white">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-[#CBD5E1] bg-[#F3F4F6] px-3.5 py-2.5 text-xs text-[#64748B]">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                Preparing your financial navigation guide...
              </span>
            </div>
          </div>
        )}

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
                  {error.message || "Please try again."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    regenerate({
                      body: {
                        audit_id: selectedAudit?.id || undefined,
                        audit_snapshot:
                          selectedAudit?.audit_results || undefined,
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

      {/* Input & Context Controls Area (Pinned to bottom) */}
      <div className="border-t border-slate-200/80 bg-white p-3 sm:p-3.5 shrink-0 space-y-2.5">
        {/* Top Toolbar: Statement Context Dropdown & Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Attached Statement Selector Pill */}
            {audits.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold shrink-0">
                <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="text-[10px] uppercase font-bold text-slate-400">Context:</span>
                <select
                  id="chatbot-bill-select"
                  value={selectedAuditId}
                  onChange={(e) => setSelectedAuditId(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[190px] sm:max-w-[280px] truncate"
                >
                  <option value="">General PH Billing Mode</option>
                  {audits.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.hospital_name} ({a.total_billed > 0 ? formatPHP(a.total_billed) : "Draft"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedAudit && (
              <Link
                href={`/audits/${selectedAudit.id}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600 transition-colors"
              >
                <span>Studio</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {/* Clear conversation button when messages exist */}
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Billy about PhilHealth case rates, doctor PF caps, or item charges..."
            disabled={isStreaming}
            className="h-10 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none disabled:opacity-60 transition-colors"
          />
          {isStreaming ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => stop()}
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
            Disclaimer: Guidance is for hospital billing audit and financial assistance navigation only, not formal medical advice.
          </span>
        </p>
      </div>

      {/* Clear Chat Confirmation Dialog */}
      {showClearConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-chat-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 transition-opacity duration-150"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4 transition-opacity duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0 shadow-2xs">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="clear-chat-title" className="text-sm font-bold text-slate-900">
                  Clear conversation?
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  This will delete all messages from this session. You can ask a new question anytime.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
                className="rounded-full h-8 px-4 text-xs font-semibold"
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
                  setShowClearConfirm(false);
                }}
                className="rounded-full h-8 px-4 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white border-transparent"
              >
                Clear Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
