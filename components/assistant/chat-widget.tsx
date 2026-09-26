"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import Link from "next/link";
import {
  Bot,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { useT, useLocale } from "@/lib/i18n/provider";
import {
  useAssistantConversation,
  useSendAssistantMessage,
  useResetAssistantConversation,
  type AssistantSuggestedAction,
} from "@/hooks/queries";

// Simple markdown formatter to handle bolding and basic lists without external deps
function formatMarkdown(text: string) {
  // First split by double newlines for paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  return paragraphs.map((paragraph, pIdx) => {
    // Then handle single newlines as line breaks
    const lines = paragraph.split('\n');
    
    return (
      <p key={pIdx} className={cn("mb-2 last:mb-0", lines.length > 1 ? "space-y-1" : "")}>
        {lines.map((line, lIdx) => {
          // Parse bold text: **text**
          const parts = line.split(/(\*\*.*?\*\*)/g);
          
          return (
            <Fragment key={lIdx}>
              {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
                }
                return <span key={i}>{part}</span>;
              })}
              {lIdx < lines.length - 1 && <br />}
            </Fragment>
          );
        })}
      </p>
    );
  });
}

/**
 * Floating AI help widget for citizens — powered by Gemini via apps/api/src/assistant.
 * Reads the signed-in citizen's own records and surfaces clickable suggested actions.
 */
export function AssistantChatWidget() {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [suggestedActions, setSuggestedActions] = useState<AssistantSuggestedAction[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversation } = useAssistantConversation();
  const sendMessage = useSendAssistantMessage();
  const resetConversation = useResetAssistantConversation();

  const messages = conversation?.messages ?? [];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sendMessage.isPending, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setHasUnread(false);
    }
  }, [open]);

  // Mark unread dot when assistant replies while panel is closed
  useEffect(() => {
    if (!open && messages.length > 0 && messages[messages.length - 1]?.role === "model") {
      setHasUnread(true);
    }
  }, [messages.length, open]);

  const handleSend = (text?: string) => {
    const message = (text ?? draft).trim();
    if (!message || sendMessage.isPending) return;
    setDraft("");
    setSuggestedActions([]);
    sendMessage.mutate(
      { message, locale },
      {
        onSuccess: (result) => {
          setSuggestedActions(result.suggestedActions);
          if (!open) setHasUnread(true);
        },
        onError: (error) => {
          const rateLimited = error instanceof ApiError && error.code === "too_many_requests";
          toast.error(rateLimited ? t.assistant.errorRateLimited : t.assistant.errorGeneric);
        },
      },
    );
  };

  const handleReset = () => {
    setSuggestedActions([]);
    resetConversation.mutate();
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* ── Launcher button ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t.assistant.launcherLabel}
        className={cn(
          "fixed right-6 bottom-6 z-50 flex size-[60px] items-center justify-center rounded-full shadow-xl shadow-[#1c4d3c]/20",
          "bg-gradient-to-tr from-[#1c4d3c] via-[#24614b] to-[#123628] text-white",
          "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110 active:scale-95 group",
          "before:absolute before:inset-0 before:rounded-full before:bg-white/20 before:opacity-0 hover:before:opacity-100 before:transition-opacity",
          open ? "translate-y-6 opacity-0 pointer-events-none scale-75" : "translate-y-0 opacity-100 scale-100",
        )}
      >
        {/* Pulse ring when unread */}
        {hasUnread && !open && (
          <>
            <span className="absolute inset-0 rounded-full bg-[#34d399] animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] opacity-60" />
            <span className="absolute top-0 right-0 size-4 rounded-full bg-orange-500 border-2 border-white shadow-sm" />
          </>
        )}
        <Sparkles className="absolute size-4 text-emerald-200 top-2.5 right-2.5 animate-pulse" />
        <MessageCircle className="size-7 relative z-10 transition-transform duration-500 group-hover:rotate-12" />
      </button>

      {/* ── Chat panel ──────────────────────────────────────────── */}
      <div
        className={cn(
          "fixed right-6 bottom-6 z-50 flex flex-col overflow-hidden rounded-[2rem] shadow-[0_24px_54px_rgba(0,0,0,0.15)]",
          "w-[min(22rem,calc(100vw-3rem))] transition-all duration-500 origin-bottom-right",
          "border border-white/40 dark:border-white/10 backdrop-blur-3xl bg-white/70 dark:bg-[#0a0f0d]/80",
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-90 translate-y-12 pointer-events-none",
        )}
        style={{ maxHeight: "min(36rem, calc(100svh - 4rem))", transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Header */}
        <div className="relative flex items-center gap-3 px-5 py-4 overflow-hidden shrink-0 border-b border-black/5 dark:border-white/5 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-[#1c4d3c] via-[#24614b] to-[#123628] opacity-100" />
          <div className="absolute top-[-50%] right-[-20%] w-64 h-64 bg-emerald-400/25 rounded-full blur-[3rem]" />
          <div className="absolute bottom-[-50%] left-[-20%] w-48 h-48 bg-teal-400/25 rounded-full blur-[2rem]" />
          
          {/* Avatar */}
          <div className="relative flex size-12 shrink-0 items-center justify-center rounded-[1rem] bg-white/10 border border-white/20 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
            <Bot className="size-6 text-white drop-shadow-md" />
            <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-emerald-400 border-[2.5px] border-[#24614b]" />
          </div>

          <div className="relative flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-white tracking-tight">{t.assistant.panelTitle}</h2>
            <p className="flex items-center gap-1.5 text-[13px] text-emerald-100/90 mt-0.5 font-medium">
              <span className="relative flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-2 bg-emerald-400"></span>
              </span>
              {t.assistant.panelSubtitle}
            </p>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              onClick={handleReset}
              aria-label={t.assistant.reset}
              title={t.assistant.reset}
              className="flex size-9 items-center justify-center rounded-full text-white/80 bg-black/10 hover:bg-black/20 hover:text-white transition-all active:scale-90"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex size-9 items-center justify-center rounded-full text-white/80 bg-black/10 hover:bg-black/20 hover:text-white transition-all active:scale-90"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-5 scroll-smooth custom-scrollbar bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.02]"
          style={{ minHeight: 0 }}
        >
          <div className="flex flex-col gap-2 h-full">
            {/* Greeting / empty state */}
            {isEmpty && (
              <div className="flex flex-col gap-4 items-center justify-center mt-8 mb-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-tr from-[#1c4d3c]/10 to-[#34d399]/10 ring-1 ring-[#1c4d3c]/20 mb-2 shadow-sm">
                  <div className="absolute inset-0 bg-[#1c4d3c]/5 rounded-full animate-pulse" />
                  <Bot className="size-10 text-[#1c4d3c] dark:text-[#4fa87e] relative z-10" />
                </div>
                <div className="text-[15px] font-medium text-foreground/80 leading-relaxed max-w-[260px] text-center">
                  {t.assistant.greeting}
                </div>
              </div>
            )}

            {/* Quick-prompt chips — only before any conversation */}
            {isEmpty && (
              <div className="flex flex-col gap-2.5 w-full mt-auto pb-2">
                {t.assistant.quickPrompts.map((prompt, i) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={sendMessage.isPending}
                    style={{ animationDelay: `${i * 80}ms` }}
                    className={cn(
                      "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500",
                      "group flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#1c4d3c]/10 dark:border-white/10",
                      "bg-white/80 dark:bg-black/40 backdrop-blur-md px-4 py-3 text-[13.5px] font-medium text-foreground/90",
                      "transition-all hover:bg-white dark:hover:bg-white/10 hover:shadow-lg hover:shadow-black/5 hover:border-[#1c4d3c]/30 hover:-translate-y-0.5 active:scale-[0.98]",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <span className="text-left leading-snug">{prompt}</span>
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1c4d3c]/5 text-[#1c4d3c] dark:bg-white/10 dark:text-white transition-colors group-hover:bg-[#1c4d3c] group-hover:text-white">
                      <ChevronRight className="size-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Conversation messages */}
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-3 duration-300", 
                    isUser ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Bot avatar */}
                  {!isUser && (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1c4d3c] to-[#24614b] shadow-md mt-auto mb-1">
                      <Bot className="size-4.5 text-white" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[92%] px-4 py-3 text-[14px] leading-relaxed shadow-sm",
                      isUser
                        ? "rounded-[20px] rounded-br-[4px] bg-gradient-to-tr from-[#1c4d3c] to-[#24614b] text-white shadow-md shadow-[#1c4d3c]/20"
                        : "rounded-[20px] rounded-bl-[4px] bg-white dark:bg-[#16201b] text-foreground border border-black/5 dark:border-white/5",
                    )}
                  >
                    {isUser ? message.content : formatMarkdown(message.content)}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {sendMessage.isPending && (
              <div className="flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#1c4d3c] to-[#24614b] shadow-md mt-auto mb-1">
                  <Bot className="size-4.5 text-white" />
                </div>
                <div className="rounded-[20px] rounded-bl-[4px] bg-white dark:bg-[#16201b] px-5 py-4 shadow-sm border border-black/5 dark:border-white/5 flex items-center gap-1.5 w-[72px]">
                  <span className="size-2 rounded-full bg-[#1c4d3c]/60 dark:bg-white/60 animate-[bounce_1.2s_infinite_0ms]" />
                  <span className="size-2 rounded-full bg-[#1c4d3c]/60 dark:bg-white/60 animate-[bounce_1.2s_infinite_200ms]" />
                  <span className="size-2 rounded-full bg-[#1c4d3c]/60 dark:bg-white/60 animate-[bounce_1.2s_infinite_400ms]" />
                </div>
              </div>
            )}

            {/* Suggested action buttons */}
            {suggestedActions.length > 0 && (
              <div className="flex flex-col gap-2 pt-1 pb-4 pl-11 animate-in fade-in duration-500">
                {suggestedActions.map((action, i) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={() => setOpen(false)}
                    style={{ animationDelay: `${i * 100}ms` }}
                    className={cn(
                      "inline-flex items-center justify-between gap-3 self-start rounded-xl px-4 py-2.5 text-[13.5px] font-semibold min-w-[180px] max-w-full",
                      "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25",
                      "transition-all hover:shadow-xl hover:shadow-orange-500/40 hover:-translate-y-0.5 active:scale-95 animate-in slide-in-from-left-4 fill-mode-both duration-300",
                    )}
                  >
                    <span className="truncate leading-snug">{action.label}</span>
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                      <ChevronRight className="size-3.5 text-white" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            
            {/* Invisible element to ensure scrolling reaches the very bottom including padding */}
            <div className="h-2 shrink-0" />
          </div>
        </div>

        {/* Input area */}
        <div className="p-4 bg-white/70 dark:bg-black/40 backdrop-blur-2xl border-t border-black/5 dark:border-white/5 shrink-0 z-10 relative">
          <div className="relative flex items-end gap-2 bg-white dark:bg-[#1a231f] rounded-[18px] shadow-sm ring-1 ring-black/5 dark:ring-white/10 focus-within:ring-2 focus-within:ring-[#1c4d3c]/50 focus-within:shadow-md transition-all p-1.5 pr-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t.assistant.placeholder}
              rows={1}
              disabled={sendMessage.isPending}
              className={cn(
                "flex-1 resize-none bg-transparent px-3 py-3 text-[15px]",
                "placeholder:text-muted-foreground/60 focus:outline-none",
                "disabled:opacity-50 min-h-[46px] max-h-32",
              )}
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={() => handleSend()}
              disabled={!draft.trim() || sendMessage.isPending}
              aria-label={t.assistant.send}
              className={cn(
                "flex size-[42px] mb-0.5 shrink-0 items-center justify-center rounded-2xl",
                "bg-gradient-to-br from-[#1c4d3c] to-[#123628] text-white transition-all duration-300",
                "disabled:opacity-40 disabled:scale-95 disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none",
                "hover:shadow-lg hover:shadow-[#1c4d3c]/30 hover:-translate-y-0.5 active:scale-95 active:translate-y-0",
              )}
            >
              <Send className="size-4.5 ml-0.5" />
            </button>
          </div>
          <div className="mt-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
              Vhumishetu AI Assistant
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
