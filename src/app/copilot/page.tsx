"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertCircle,
  Bot,
  Building2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FormattedChatContent,
  STARTER_PROMPTS,
} from "@/components/audit/AuditCopilotDrawer";
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

export default function CopilotPage() {
  const supabase = useMemo(() => createClient(), []);
  const [audits, setAudits] = useState<AuditOption[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string>("");
  const [input, setInput] = useState("");
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
    id: `standalone-copilot-${selectedAuditId || "general"}`,
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

  return (
    <div className="mx-auto max-w-3xl space-y-4 animate-in fade-in duration-300">
      {/* Solid Navy Header Banner */}
      <div className="rounded-2xl border border-[#1E293B] bg-[#1E293B] p-5 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB] text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-white">
                  AI Health &amp; Subsidy Copilot
                </h1>
                <span className="rounded-full bg-[#2563EB] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Live Gemini Flash
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#CBD5E1]">
                Ask about flagged hospital charges, PhilHealth Case Rate rules,
                Senior/PWD discounts, and Malasakit Center requirements.
              </p>
            </div>
          </div>

          {selectedAudit && (
            <Link
              href={`/audits/${selectedAudit.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20 whitespace-nowrap"
            >
              <span>Open in Studio</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Active Bill Context Selector */}
        {audits.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/15 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor="copilot-bill-select"
              className="flex items-center gap-1.5 text-xs font-bold text-[#CBD5E1]"
            >
              <Building2 className="h-3.5 w-3.5 text-[#2563EB]" />
              <span>Attached Statement Context:</span>
            </label>
            <select
              id="copilot-bill-select"
              value={selectedAuditId}
              onChange={(e) => setSelectedAuditId(e.target.value)}
              className="rounded-xl border border-[#CBD5E1]/30 bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-white focus:border-[#2563EB] focus:outline-none"
            >
              <option value="">General PH Billing &amp; Subsidy Mode</option>
              {audits.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.hospital_name} —{" "}
                  {a.total_billed > 0
                    ? formatPHP(a.total_billed)
                    : "Pending OCR"}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Chat Card */}
      <Card className="bg-white">
        <CardContent className="flex flex-col p-0 md:p-0">
          {/* Starter Prompt Bar */}
          <div className="border-b border-[#CBD5E1] bg-[#F3F4F6] px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                One-Tap Patient Queries
              </span>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    stop();
                    setMessages([]);
                    clearError();
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[#64748B] hover:text-[#1E293B]"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear chat
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => handleSendQuery(prompt)}
                  className="cursor-pointer rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5 text-left text-xs font-semibold text-[#1E293B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Viewport */}
          <div
            ref={scrollContainerRef}
            className="min-h-[360px] max-h-[520px] space-y-3.5 overflow-y-auto p-4"
          >
            {messages.length === 0 && (
              <div className="rounded-2xl border border-[#CBD5E1] bg-[#F3F4F6] p-4 text-xs text-[#1E293B]">
                <p className="font-bold">
                  Kumusta! How can I help you navigate your hospital bill today?
                </p>
                <p className="mt-1 leading-relaxed text-[#64748B]">
                  {selectedAudit?.audit_results
                    ? `Your statement from ${selectedAudit.hospital_name} (${formatPHP(
                        selectedAudit.audit_results.gross_total
                      )}) is loaded. Tap any suggested question above or type your own below.`
                    : "Tap any question above to learn about Malasakit Center documents, PhilHealth Case Rate deductions, or Senior/PWD discounts."}
                </p>
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
                    <p className="font-bold">Could not reach AI Copilot</p>
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

          {/* Input & Disclaimer Footer */}
          <div className="border-t border-[#CBD5E1] bg-white p-4">
            <form
              onSubmit={handleFormSubmit}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about Malasakit Center, PhilHealth PF, or a flagged line item..."
                disabled={isStreaming}
                className="h-10 flex-1 rounded-full border border-[#CBD5E1] bg-[#F3F4F6] px-4 text-xs text-[#1E293B] placeholder:text-[#64748B] focus:border-[#2563EB] focus:bg-white focus:outline-none disabled:opacity-60"
              />
              {isStreaming ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => stop()}
                  className="h-10 shrink-0 rounded-full px-4"
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
                  className="h-10 shrink-0 rounded-full px-5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send</span>
                </Button>
              )}
            </form>

            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-[#64748B]">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
              <span>
                Disclaimer: Guidance is for hospital billing audit and financial
                assistance navigation only, not formal medical advice.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
