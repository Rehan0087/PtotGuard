"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n";
import { MswProvider } from "./msw-provider";

export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <LocaleProvider initialLocale={locale}>
      <MswProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delay={200}>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </TooltipProvider>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </QueryClientProvider>
      </MswProvider>
    </LocaleProvider>
  );
}
