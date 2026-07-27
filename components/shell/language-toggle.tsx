"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/provider";

/**
 * English ⇄ বাংলা. Each language is named in itself, so the option a reader
 * wants is legible even when the current language isn't one they read.
 */
export function LanguageToggle() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.shell.changeLanguage}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1.5 px-2 text-muted-foreground",
        )}
      >
        <Languages className="size-4" />
        <span className="text-xs font-medium">{LOCALE_SHORT_LABELS[locale]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
          {t.shell.language}
        </div>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) => setLocale(next as Locale)}
        >
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {LOCALE_LABELS[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
