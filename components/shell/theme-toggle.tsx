"use client";

import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/hooks/use-theme";
import { useT } from "@/lib/i18n/provider";

export function ThemeToggle() {
  const t = useT();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t.shell.toggleTheme}
      onClick={toggleTheme}
    >
      {/* Both icons render; the .dark class (set before paint) picks one via CSS. */}
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
