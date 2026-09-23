"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import { useT, useLocale } from "@/lib/i18n/provider";
import {
  useAssistantConversation,
  useSendAssistantMessage,
  useResetAssistantConversation,
  type AssistantSuggestedAction,
} from "@/hooks/queries";

/**
 * Floating help widget for citizens only — see apps/api/src/assistant. It
 * only reads the signed-in citizen's own records and never files or pays
 * anything; suggested actions are links, not actions taken on their behalf.
 */
export function AssistantChatWidget() {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [suggestedActions, setSuggestedActions] = useState<AssistantSuggestedAction[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useAssistantConversation();
  const sendMessage = useSendAssistantMessage();
  const resetConversation = useResetAssistantConversation();

  const messages = conversation?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sendMessage.isPending]);

  const handleSend = () => {
    const message = draft.trim();
    if (!message || sendMessage.isPending) return;
    setDraft("");
    setSuggestedActions([]);
    sendMessage.mutate(
      { message, locale },
      {
        onSuccess: (result) => setSuggestedActions(result.suggestedActions),
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

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        aria-label={t.assistant.launcherLabel}
        size="icon-lg"
        className="fixed right-5 bottom-5 z-50 rounded-full shadow-lg"
      >
        <MessageCircle />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="flex-row items-center justify-between border-b border-border pb-3">
            <SheetTitle>{t.assistant.panelTitle}</SheetTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-8"
              onClick={handleReset}
              aria-label={t.assistant.reset}
              title={t.assistant.reset}
            >
              <RotateCcw />
            </Button>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
            <div className="flex flex-col gap-3 py-4">
              {messages.length === 0 && (
                <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {t.assistant.greeting}
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    message.role === "user"
                      ? "self-end bg-primary text-primary-foreground"
                      : "self-start bg-muted text-foreground",
                  )}
                >
                  {message.content}
                </div>
              ))}
              {sendMessage.isPending && (
                <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {t.assistant.thinking}
                </div>
              )}
              {suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-2 self-start">
                  {suggestedActions.map((action) => (
                    <Button
                      key={action.href}
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={action.href} onClick={() => setOpen(false)} />}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-end gap-2 border-t border-border p-3">
            <Textarea
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
              className="min-h-9 resize-none"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!draft.trim() || sendMessage.isPending}
              aria-label={t.assistant.send}
            >
              <Send />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
