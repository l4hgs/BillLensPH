import React from "react";
import { BotMessageSquare, Sparkles, Send, ShieldCheck, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function CopilotPage() {
  return (
    <div className="p-4 flex flex-col h-[calc(100vh-140px)] justify-between space-y-4">
      <div className="space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              AI Subsidy Copilot
            </h1>
            <p className="text-xs text-slate-500">
              Ask questions on PhilHealth policies, Malasakit centers, and DSWD assistance.
            </p>
          </div>
          <Badge variant="primary" dot>
            Gemini Flash
          </Badge>
        </div>

        {/* Assistant Welcome Bubble */}
        <div className="flex gap-2.5 items-start">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
            <BotMessageSquare className="w-4 h-4" />
          </div>
          <div className="bg-white border border-slate-200/90 rounded-2xl rounded-tl-xs p-3.5 shadow-soft text-xs text-slate-800 space-y-2 max-w-[85%]">
            <p className="font-semibold text-blue-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Kumusta! I am your BillLens Copilot.
            </p>
            <p className="leading-relaxed">
              I can help cross-check if your hospital is double-charging for items covered by your PhilHealth case rate, or guide you on the documents needed for a Malasakit Center medical guarantee letter.
            </p>
          </div>
        </div>

        {/* Suggested Prompts */}
        <div className="space-y-2 pt-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block px-1">
            Frequently Asked
          </span>
          <div className="flex flex-col gap-2">
            {[
              "Does PhilHealth cover laparoscopic surgery supplies?",
              "What requirements do I need for Malasakit Center assistance?",
              "Can the hospital charge professional fees beyond the case rate?",
            ].map((prompt, i) => (
              <button
                key={i}
                className="text-left text-xs p-3 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 text-slate-700 transition-all shadow-xs"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input box */}
      <div className="pt-2">
        <div className="relative flex items-center">
          <input
            type="text"
            placeholder="Ask about hospital charges, case rates, or DSWD..."
            className="w-full bg-white border border-slate-200 rounded-full pl-4 pr-12 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-soft"
          />
          <button
            type="button"
            className="absolute right-1.5 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all shadow-sm shadow-blue-500/30 active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
