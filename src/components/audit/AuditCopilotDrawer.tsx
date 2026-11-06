"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User,
  ShieldAlert,
  ArrowRight,
  HelpCircle,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AuditCopilotDrawerProps {
  auditId: string;
  hospitalName?: string;
}

const STARTER_PROMPTS = [
  {
    title: "Malasakit Center Requirements",
    prompt: "What documents do I need for the Malasakit Center?",
    icon: FileCheck2,
  },
  {
    title: "Flagged Yellow Items",
    prompt: "Why is this laboratory test flagged yellow?",
    icon: ShieldAlert,
  },
  {
    title: "Doctor's PF Coverage",
    prompt: "How much should PhilHealth cover for my doctor's PF?",
    icon: HelpCircle,
  },
];

export function AuditCopilotDrawer({
  auditId,
  hospitalName,
}: AuditCopilotDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSendMessage = async (userPrompt?: string) => {
    const messageText = (userPrompt ?? input).trim();
    if (!messageText || isLoading) return;

    setError(null);
    setInput("");

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: messageText,
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    const assistantId = `assistant-${Date.now()}`;
    const initialAssistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages([...newMessages, initialAssistantMessage]);

    try {
      const response = await fetch("/api/audit/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auditId,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        let errMessage = "Failed to communicate with Copilot.";
        try {
          const errData = await response.json();
          if (errData?.error) errMessage = errData.error;
        } catch {
          // ignore parsing error
        }
        throw new Error(errMessage);
      }

      if (!response.body) {
        throw new Error("No response body received.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: accumulatedText }
              : msg
          )
        );
      }
    } catch (err) {
      console.error("Copilot stream error:", err);
      const msg = err instanceof Error ? err.message : "Error receiving reply.";
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Paumanhin, nagkaroon ng technical issue sa koneksyon. Pakisubukang magtanong ulit.",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptClick = (prompt: string) => {
    handleSendMessage(prompt);
  };

  return (
    <>
      {/* Floating "Ask Copilot" Pill Button */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 px-4 sm:px-5 py-3 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 active:scale-95 transition-all duration-200 cursor-pointer"
          aria-label="Open AI Health & Subsidy Copilot"
        >
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
          </div>
          <span>Ask Copilot</span>
        </button>
      </div>

      {/* Drawer Portal */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end">
            {/* Backdrop */}
            <div
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
              aria-hidden="true"
            />

            {/* Drawer Body (Bottom sheet on mobile, slide-over on desktop) */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="BillLens Copilot Chat Drawer"
              className="relative w-full sm:w-[460px] h-[85vh] sm:h-full max-h-[85vh] sm:max-h-full bg-white rounded-t-[28px] sm:rounded-t-none sm:rounded-l-[28px] shadow-2xl flex flex-col z-10 overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-right duration-300 border-l sm:border-slate-200"
            >
              {/* Mobile Drag Indicator Pill */}
              <div className="sm:hidden flex justify-center pt-3 pb-1">
                <span className="w-10 h-1 rounded-full bg-slate-300" />
              </div>

              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-[#2563EB] flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-tight">
                        BillLens Copilot
                      </h3>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-[#2563EB] border border-blue-200/60">
                        AI Nav
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate max-w-[220px] sm:max-w-xs mt-0.5">
                      {hospitalName ? `Grounded in ${hospitalName}` : "Patient Financial Navigator"}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  aria-label="Close Copilot Drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Message Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* Empty State / Welcome Screen */}
                {messages.length === 0 && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/70 text-slate-800 text-xs sm:text-sm leading-relaxed space-y-2">
                      <p className="font-bold text-[#2563EB] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        Kumusta! Paano kita matutulungan sa iyong ospital bill?
                      </p>
                      <p className="text-slate-600 text-xs">
                        I am your AI health & subsidy copilot. I can explain flagged
                        unbundled charges, check your PhilHealth case rates, and guide
                        you through government assistance at the Malasakit Center, DSWD, and PCSO.
                      </p>
                    </div>

                    {/* Starter Prompt Chips */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-1">
                        One-tap patient queries:
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {STARTER_PROMPTS.map((item, index) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handlePromptClick(item.prompt)}
                              className="w-full text-left p-3 rounded-2xl bg-[#F8FAFC] hover:bg-blue-50/60 border border-slate-200/80 hover:border-blue-300 transition-all duration-200 flex items-center justify-between gap-3 text-xs font-semibold text-slate-800 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <span className="truncate">{item.prompt}</span>
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Rendered Messages */}
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser && (
                        <div className="w-7 h-7 rounded-xl bg-blue-50 border border-blue-200 text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}

                      <div
                        className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed max-w-[85%] ${
                          isUser
                            ? "bg-[#2563EB] text-white rounded-br-xs font-medium shadow-xs"
                            : "bg-[#F1F3F5] text-slate-900 rounded-bl-xs whitespace-pre-line"
                        }`}
                      >
                        {message.content ? (
                          message.content
                        ) : (
                          <div className="flex items-center gap-1.5 py-1 text-slate-500 text-xs">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                            <span>Nag-iisip si Copilot...</span>
                          </div>
                        )}
                      </div>

                      {isUser && (
                        <div className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {error && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                    {error}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-white shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Tanong tungkol sa bill o tulong pinansyal..."
                    disabled={isLoading}
                    className="flex-1 bg-[#F4F4F5] border border-[#E5E7EB] rounded-full px-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!input.trim() || isLoading}
                    className="h-10 w-10 p-0 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] shrink-0"
                    aria-label="Send message"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Send className="w-4 h-4 text-white" />
                    )}
                  </Button>
                </form>
                <p className="text-[10px] text-slate-400 text-center mt-2 font-normal">
                  Financial & billing guidance only • Not medical advice.
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

