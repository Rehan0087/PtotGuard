"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { Loader2, LogIn } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { LanguageToggle } from "@/components/shell/language-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";
import { useSessionStore } from "@/store/session";
import { roleHome } from "@/lib/nav";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, verifyDemoCredentials } from "@/lib/demo-accounts";
import type { LoginFailure } from "@/lib/demo-accounts";

/** Built per locale — every message here is read by whoever is signing in. */
function makeSchema(t: Dictionary) {
  return z.object({
    email: z.string().min(1, t.common.required).email(t.login.errorTitle),
    password: z.string().min(1, t.common.required),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const login = useSessionStore((s) => s.login);
  const role = useSessionStore((s) => s.role);
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const hasHydrated = useSessionStore((s) => s.hasHydrated);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  useEffect(() => {
    if (hasHydrated && isAuthenticated) router.replace(roleHome(role));
  }, [hasHydrated, isAuthenticated, role, router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(makeSchema(t)),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: FormValues) {
    const result = verifyDemoCredentials(values.email, values.password);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setFailure(null);
    login(result.account.role);
    router.push(roleHome(result.account.role));
  }

  function fillDemoAccount(email: string) {
    setFailure(null);
    setValue("email", email);
    setValue("password", DEMO_PASSWORD);
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-1 text-center">
            <h1 className="font-heading text-xl font-semibold text-foreground">
              {t.common.appName}
            </h1>
            <p className="text-sm text-muted-foreground">{t.login.tagline}</p>
          </div>

          <Card>
            <CardContent className="pt-1">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {failure ? (
                  <Alert variant="destructive">
                    <AlertTitle>
                      {failure.code === "unknown-email"
                        ? t.login.errorTitle
                        : t.login.wrongPasswordTitle}
                    </AlertTitle>
                    <AlertDescription>
                      {failure.code === "unknown-email"
                        ? t.login.errorBody
                        : t.login.wrongPasswordBody}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="email">{t.login.emailLabel}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t.login.emailPlaceholder}
                    aria-invalid={Boolean(errors.email)}
                    {...register("email")}
                  />
                  {errors.email ? (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">{t.login.passwordLabel}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t.login.passwordPlaceholder}
                    aria-invalid={Boolean(errors.password)}
                    {...register("password")}
                  />
                  {errors.password ? (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  ) : null}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LogIn className="size-4" />
                  )}
                  {isSubmitting ? t.login.submitting : t.login.submit}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.login.demoAccountsLabel}
            </div>
            <div className="grid gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemoAccount(account.email)}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {account.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {account.email}
                    </span>
                  </span>
                  <span className="ml-2 shrink-0 rounded bg-marker/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-marker">
                    {t.roles[account.role]}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {t.login.demoPasswordHint}{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {DEMO_PASSWORD}
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
