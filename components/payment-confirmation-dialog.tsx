"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

const METHODS: {
  value: PaymentMethod;
  label: "bkash" | "nagad" | "card";
  color: string;
  bg: string;
  image: string;
  imageClassName: string;
}[] = [
  {
    value: "bkash",
    label: "bkash",
    color: "text-pink-600",
    bg: "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800",
    image: "/payment-methods/bkash.png",
    imageClassName: "h-12 w-24",
  },
  {
    value: "nagad",
    label: "nagad",
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    image: "/payment-methods/nagad.png",
    imageClassName: "h-12 w-24",
  },
  {
    value: "card",
    label: "card",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    image: "/payment-methods/card.png",
    imageClassName: "h-16 w-16",
  },
];

type Step = "method" | "details" | "pin";

type Props = {
  open: boolean;
  amount: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (method: PaymentMethod) => void;
};

/**
 * Multi-step checkout dialog:
 *   Step 1 – Choose method (bKash / Nagad / Card), and nothing else
 *   Step 2 – Enter the selected wallet number or card details
 *   Step 3 – Verify the bKash/Nagad PIN (cards pay after their details)
 * Account/card details and PIN never leave this component; the API receives
 * only the selected method after a successful PIN entry.
 */
export function PaymentConfirmationDialog({
  open,
  amount,
  busy = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const t = useT();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [account, setAccount] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<Step>("method");
  const [error, setError] = useState("");

  const isCard = method === "card";
  const selectedMethod = METHODS.find((m) => m.value === method);

  // ── Formatting helpers ────────────────────────────────────────────────────
  function formatCard(value: string) {
    return value
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  }

  function formatMobile(value: string) {
    return value.replace(/\D/g, "").slice(0, 11);
  }

  function formatExpiry(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }

  // ── Details validation → mobile PIN or direct card confirmation ───────────
  function handleProceed() {
    if (!method) return;
    const digits = account.replace(/\D/g, "");
    if (isCard && digits.length !== 16) {
      setError(t.common.payment.invalidNumber);
      return;
    }
    if (!isCard && !/^01\d{9}$/.test(digits)) {
      setError(t.common.payment.invalidNumber);
      return;
    }
    if (isCard && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      setError(t.common.payment.invalidExpiry);
      return;
    }
    if (isCard && !/^\d{3,4}$/.test(cvv)) {
      setError(t.common.payment.invalidCvv);
      return;
    }
    setError("");
    if (isCard) {
      onConfirm(method);
      return;
    }
    setPin("");
    setStep("pin");
  }

  // ── Mobile-wallet PIN validation → fire onConfirm ─────────────────────────
  function handleConfirmPin() {
    if (!method) return;
    if (pin !== "1234") {
      setError(t.common.payment.invalidPin);
      return;
    }
    setError("");
    onConfirm(method);
  }

  // ── Reset when dialog closes ─────────────────────────────────────────────
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("method");
      setAccount("");
      setExpiry("");
      setCvv("");
      setPin("");
      setError("");
      setMethod(null);
    }
    onOpenChange(nextOpen);
  }

  // ── Masked account for PIN screen ────────────────────────────────────────
  function maskedAccount() {
    const digits = account.replace(/\D/g, "");
    if (isCard) return `•••• •••• •••• ${digits.slice(-4)}`;
    return `•••• •••• ${digits.slice(-4)}`;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!busy} className="overflow-hidden p-0">
        {/* ── Step 1: Method only ──────────────────────────────────────── */}
        {step === "method" && (
          <div className="space-y-5 p-6">
            <DialogHeader>
              <DialogTitle>{t.common.payment.title}</DialogTitle>
              <DialogDescription>{t.common.payment.description(amount)}</DialogDescription>
            </DialogHeader>

            {/* Method selector */}
            <div className="space-y-2">
              <span className="block text-sm font-medium text-foreground">{t.common.payment.method}</span>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((option) => {
                  return (
                    <button
                      type="button"
                      key={option.value}
                      disabled={busy}
                      onClick={() => {
                        setMethod(option.value);
                        setAccount("");
                        setExpiry("");
                        setCvv("");
                        setPin("");
                        setError("");
                        setStep("details");
                      }}
                      className={cn(
                        "flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-white px-3 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-muted-foreground/50 hover:shadow-sm dark:bg-white",
                      )}
                    >
                      <span className={cn("relative block", option.imageClassName)}>
                        <Image
                          src={option.image}
                          alt=""
                          fill
                          sizes="96px"
                          className="object-contain"
                        />
                      </span>
                      {option.label === "bkash"
                        ? "bKash"
                        : option.label === "nagad"
                          ? "Nagad"
                          : "Card"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Number or card details ───────────────────────────── */}
        {step === "details" && method && selectedMethod && (
          <div className="space-y-5 p-6">
            <DialogHeader>
              <DialogTitle>{t.common.payment.title}</DialogTitle>
              <DialogDescription>{t.common.payment.description(amount)}</DialogDescription>
            </DialogHeader>

            <div className={cn("flex items-center gap-3 rounded-xl border p-3", selectedMethod.bg)}>
              <span className={cn("relative block shrink-0", selectedMethod.imageClassName)}>
                <Image
                  src={selectedMethod.image}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-contain"
                />
              </span>
              <div>
                <p className="font-semibold text-foreground">
                  {method === "bkash" ? "bKash" : method === "nagad" ? "Nagad" : "Card"}
                </p>
                <p className="text-sm text-muted-foreground">{amount}</p>
              </div>
            </div>

            {/* Account / card number */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                {isCard ? t.common.payment.cardNumber : t.common.payment.mobileNumber}
              </label>
              <Input
                inputMode="numeric"
                autoComplete={isCard ? "cc-number" : "tel"}
                placeholder={
                  isCard ? t.common.payment.cardNumber : t.common.payment.mobilePlaceholder
                }
                value={account}
                onChange={(e) =>
                  setAccount(
                    isCard ? formatCard(e.target.value) : formatMobile(e.target.value),
                  )
                }
                disabled={busy}
                className="font-mono tracking-widest text-base"
              />
            </div>

            {/* Card-only: expiry + CVV */}
            {isCard && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    {t.common.payment.expiry}
                  </label>
                  <Input
                    placeholder={t.common.payment.expiryPlaceholder}
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    disabled={busy}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground">
                    {t.common.payment.cvv}
                  </label>
                  <Input
                    inputMode="numeric"
                    type="password"
                    maxLength={4}
                    value={cvv}
                    onChange={(e) =>
                      setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    disabled={busy}
                    className="font-mono"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("method");
                  setMethod(null);
                  setAccount("");
                  setExpiry("");
                  setCvv("");
                  setError("");
                }}
                disabled={busy}
              >
                <ArrowLeft className="size-4" />
                {t.common.payment.back}
              </Button>
              <Button
                onClick={handleProceed}
                disabled={busy}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {isCard
                  ? busy
                    ? t.common.payment.verifying
                    : t.common.payment.pay(amount)
                  : t.common.payment.verifyPin}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: PIN Flash Card ────────────────────────────────────── */}
        {step === "pin" && method && selectedMethod && (
          <div className="flex flex-col">
            {/* Coloured brand band */}
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2 border-b px-6 py-8 text-center",
                selectedMethod.bg,
              )}
            >
              <span className={cn("relative block", selectedMethod.imageClassName)}>
                <Image
                  src={selectedMethod.image}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-contain"
                />
              </span>
              <p className={cn("text-lg font-bold", selectedMethod.color)}>
                {method === "bkash" ? "bKash" : method === "nagad" ? "Nagad" : "Card"}
              </p>
              <p className="font-mono text-sm text-muted-foreground">{maskedAccount()}</p>
              <p className="text-2xl font-extrabold text-foreground">{amount}</p>
            </div>

            {/* PIN entry */}
            <div className="space-y-4 p-6">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  {t.common.payment.pin}
                </label>
                <Input
                  id="payment-pin-input"
                  inputMode="numeric"
                  type="password"
                  maxLength={4}
                  autoFocus
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setError("");
                  }}
                  disabled={busy}
                  className="font-mono text-center text-lg tracking-[0.5em]"
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmPin()}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep("details");
                    setPin("");
                    setError("");
                  }}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <ArrowLeft className="size-4" />
                  {t.common.payment.back}
                </Button>
                <Button onClick={handleConfirmPin} disabled={busy} className="gap-1.5">
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {busy ? t.common.payment.verifying : t.common.payment.pay(amount)}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
