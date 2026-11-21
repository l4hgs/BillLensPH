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
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/client";
import type { AuditEngineResult } from "@/types/audit";

export interface AuditOption {
  id: string;
  hospital_name: string;
  total_billed: number;
  created_at: string;
  audit_results: AuditEngineResult | null;
}

interface ChatbotBackgroundContextValue {
  messages: UIMessage[];
  input: string;
  setInput: (value: string) => void;
  status: "ready" | "submitted" | "streaming" | "error";
  isStreaming: boolean;
  error: Error | undefined;
  clearError: () => void;
  sendQuery: (queryText: string) => Promise<void>;
  stop: () => void;
  regenerate: () => Promise<void>;
  clearChat: () => void;
  audits: AuditOption[];
  selectedAuditId: string;
  setSelectedAuditId: (id: string) => void;
  selectedAudit: AuditOption | null;
  hasUnreadMessage: boolean;
  markAsRead: () => void;
}

const ChatbotBackgroundContext =
  createContext<ChatbotBackgroundContextValue | null>(null);

export function ChatbotBackgroundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [audits, setAudits] = useState<AuditOption[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string>("");
  const [input, setInput] = useState("");
  const [hasUnreadMessage, setHasUnreadMessage] = useState(false);
  const isHydratedRef = useRef(false);

  // Fetch recent audited statements for hospital context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("audits")
          .select("id, hospital_name, total_billed, created_at, audit_results")
          .order("created_at", { ascending: false })
          .limit(15);

        if (cancelled || !data) return;

        const mapped: AuditOption[] = data.map((row) => ({
          id: row.id,
          hospital_name:
            row.hospital_name || "Philippine Healthcare Institution",
          total_billed: Number(row.total_billed) || 0,
          created_at: row.created_at,
          audit_results:
            row.audit_results &&
            typeof row.audit_results === "object" &&
            Array.isArray(
              (row.audit_results as unknown as AuditEngineResult).line_items
            )
              ? (row.audit_results as unknown as AuditEngineResult)
              : null,
        }));

        setAudits(mapped);
        if (!selectedAuditId) {
          const firstAnalyzed = mapped.find((a) => a.audit_results !== null);
          if (firstAnalyzed) {
            setSelectedAuditId(firstAnalyzed.id);
          } else if (mapped[0]) {
            setSelectedAuditId(mapped[0].id);
          }
        }
      } catch {
        // Handled silently
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, selectedAuditId]);

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
    regenerate: originalRegenerate,
    setMessages,
    clearError,
  } = useChat({
    id: `standalone-chatbot-${selectedAuditId || "general"}`,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Restore messages from localStorage whenever selected audit changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = `billlens_chat_${selectedAuditId || "general"}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
    isHydratedRef.current = true;
  }, [selectedAuditId, setMessages]);

  // Persist messages to localStorage when updated
  useEffect(() => {
    if (typeof window === "undefined" || !isHydratedRef.current) return;
    const storageKey = `billlens_chat_${selectedAuditId || "general"}`;
    try {
      if (messages.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage quota or serialization fallback
    }
  }, [messages, selectedAuditId]);

  // Beforeunload warning while streaming
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isStreaming) {
        e.preventDefault();
        e.returnValue =
          "Billy is currently responding to your hospital query. Closing this tab will terminate the response.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isStreaming]);

  // Dynamic document title & unread notifications when streaming in background tab
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (isStreaming) {
      document.title = "💬 Billy is answering... - BillLens PH";
    } else if (status === "ready" && messages.length > 0) {
      if (document.hidden) {
        queueMicrotask(() => setHasUnreadMessage(true));
        document.title = "✓ Billy answered! - BillLens PH";
      }
    }
  }, [isStreaming, status, messages.length]);

  const markAsRead = useCallback(() => {
    setHasUnreadMessage(false);
    if (typeof document !== "undefined") {
      if (
        document.title.startsWith("💬") ||
        document.title.startsWith("✓ Billy")
      ) {
        document.title =
          "BillLens PH - Hospital Statement Auditor & PhilHealth Assistant";
      }
    }
  }, []);

  const sendQuery = useCallback(
    async (queryText: string) => {
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
    },
    [isStreaming, clearError, sendMessage, selectedAudit]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    if (typeof window !== "undefined") {
      const storageKey = `billlens_chat_${selectedAuditId || "general"}`;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // Fallback
      }
    }
  }, [selectedAuditId, setMessages]);

  const regenerate = useCallback(async () => {
    await originalRegenerate({
      body: {
        audit_id: selectedAudit?.id || undefined,
        audit_snapshot: selectedAudit?.audit_results || undefined,
      },
    });
  }, [originalRegenerate, selectedAudit]);

  return (
    <ChatbotBackgroundContext.Provider
      value={{
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
        hasUnreadMessage,
        markAsRead,
      }}
    >
      {children}
    </ChatbotBackgroundContext.Provider>
  );
}

export function useChatbotBackground(): ChatbotBackgroundContextValue {
  const context = useContext(ChatbotBackgroundContext);
  if (!context) {
    throw new Error(
      "useChatbotBackground must be used within a ChatbotBackgroundProvider"
    );
  }
  return context;
}
