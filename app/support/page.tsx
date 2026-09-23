"use client";

import { GovNavbar } from "@/components/shell/gov-navbar";
import { PageHeader } from "@/components/page-header";
import { UserManual } from "@/components/manual/user-manual";
import { useT } from "@/lib/i18n/provider";

/** Public copy of the manual — the landing navbar links here, signed in or not. */
export default function SupportPage() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <GovNavbar />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-8 sm:px-6 lg:py-12">
        <PageHeader title={t.pages.manual.heading} description={t.pages.manual.description} />
        <UserManual />
      </main>
    </div>
  );
}
