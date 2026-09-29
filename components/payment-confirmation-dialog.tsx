"use client";

import { useState } from "react";
import {
  CreditCard,
  Smartphone,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Lock,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

const METHODS: {
  value: PaymentMethod;
  label: "bkash" | "nagad" | "card";
  displayName: string;
  color: string;
  bg: string;
  gradientFrom: string;
  gradientTo: string;
  border: string;
  logo: string;
}[] = [
  {
    value: "bkash",
    label: "bkash",
    displayName: "bKash",
    color: "text-pink-600 dark:text-pink-400",
    bg: "bg-pink-50 dark:bg-pink-950/40",
    gradientFrom: "from-pink-500",
    gradientTo: "to-rose-600",
    border: "border-pink-200 dark:border-pink-800",
    logo: "/payment-methods/bkash.png",
  },
  {
    value: "nagad",
    label: "nagad",
    displayName: "Nagad",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    gradientFrom: "from-orange-500",
    gradientTo: "to-red-500",
    border: "border-orange-200 dark:border-orange-800",
    logo: "/payment-methods/nagad.png",
  },
  {
    value: "card",
    label: "card",
    displayName: "Card",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    gradientFrom: "from-blue-500",
    gradientTo: "to-indigo-600",
    border: "border-blue-200 dark:border-blue-800",
    logo: "/payment-methods/card.png",
  },
];

type Step = "method-and-number" | "pin";

type Props = {
  open: boolean;
  amount: string;
  defaultMethod?: PaymentMethod;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (method: PaymentMethod) => void;
};

/**
 * Multi-step checkout dialog:
 *   Step 1 – Choose method (bKash / Nagad / Card) + enter account/card number
 *   Step 2 – PIN flash card to confirm payment
 * Account/card details and PIN never leave this component; the API receives
 * only the selected method after a successful PIN entry.
 */
export function PaymentConfirmationDialog({
  open,
  amount,
  defaultMethod = "bkash",
  busy = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const t = useT();
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [account, setAccount] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<Step>("method-and-number");
  const [error, setError] = useState("");

  const isCard = method === "card";
  const selectedMethod = METHODS.find((m) => m.value === method)!;

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

  // ── Step 1 validation → advance to PIN step ───────────────────────────────
  function handleProceed() {
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
    setPin("");
    setStep("pin");
  }

  // ── Step 2 PIN validation → fire onConfirm ───────────────────────────────
  function handleConfirmPin() {
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
      setStep("method-and-number");
      setAccount("");
      setExpiry("");
      setCvv("");
      setPin("");
      setError("");
      setMethod(defaultMethod);
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
      <DialogContent showCloseButton={!busy} className="overflow-hidden p-0 sm:max-w-md">
        {/* ── Step 1: Method + Account Number ──────────────────────────── */}
        {step === "method-and-number" && (
          <div className="flex flex-col">
            {/* Header band */}
            <div className="bg-gradient-to-r from-primary/90 to-primary px-6 py-5 text-primary-foreground">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="size-3.5 opacity-80" />
                <span className="text-xs font-medium opacity-80 uppercase tracking-wide">Secure Payment</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm opacity-75">{t.common.payment.title}</p>
                  <p className="text-3xl font-bold tracking-tight mt-0.5">{amount}</p>
                </div>
                <ShieldCheck className="size-8 opacity-30" />
              </div>
            </div>

            <div className="space-y-5 p-6">
              {/* Method selector */}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-foreground">{t.common.payment.method}</span>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((option) => {
                    const Icon = option.value === "card" ? CreditCard : Smartphone;
                    const isSelected = method === option.value;
                    return (
                      <button
                        type="button"
                        key={option.value}
                        disabled={busy}
                        onClick={() => {
                          setMethod(option.value);
                          setAccount("");
                          setError("");
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all duration-200",
                          isSelected
                            ? `${option.bg} ${option.color} ${option.border} shadow-sm scale-[1.02]`
                            : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/30",
                        )}
                      >
                        <div className="relative h-6 w-16">
                          <Image
                            src={option.logo}
                            alt={option.displayName}
                            fill
                            className={cn("object-contain", isSelected ? "" : "grayscale opacity-70")}
                          />
                        </div>
                        {option.displayName}
                      </button>
                    );
                  })}
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
                    isCard ? t.common.payment.cardPlaceholder : t.common.payment.mobilePlaceholder
                  }
                  value={account}
                  onChange={(e) =>
                    setAccount(
                      isCard ? formatCard(e.target.value) : formatMobile(e.target.value),
                    )
                  }
                  disabled={busy}
                  className="font-mono tracking-widest text-base h-11"
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
                      className="font-mono h-11"
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
                      className="font-mono h-11"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
                  {t.common.cancel}
                </Button>
                <Button
                  onClick={handleProceed}
                  disabled={busy || !account}
                  className={cn(
                    "gap-2 bg-gradient-to-r transition-all",
                    selectedMethod.gradientFrom,
                    selectedMethod.gradientTo,
                    "text-white hover:opacity-90 border-0 shadow-md",
                  )}
                >
                  <Lock className="size-3.5" />
                  {t.common.payment.verifyPin}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: PIN Flash Card ────────────────────────────────────── */}
        {step === "pin" && (
          <div className="flex flex-col">
            {/* Gradient brand band */}
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 px-6 py-8 text-center overflow-hidden",
                `bg-gradient-to-br ${selectedMethod.gradientFrom} ${selectedMethod.gradientTo}`,
              )}
            >
              {/* Decorative circles */}
              <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-white/10" />

              <div className="relative flex size-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 shadow-lg p-2">
                <div className="relative size-full">
                  <Image
                    src={selectedMethod.logo}
                    alt={selectedMethod.displayName}
                    fill
                    className="object-contain drop-shadow-md"
                  />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-white">
                  {selectedMethod.displayName}
                </p>
                <p className="font-mono text-sm text-white/70 mt-0.5">{maskedAccount()}</p>
              </div>

              {/* Amount display */}
              <div className="mt-1 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-6 py-3 shadow-inner">
                <p className="text-xs text-white/60 font-medium uppercase tracking-wider mb-0.5">Amount Due</p>
                <p className="text-3xl font-extrabold text-white tracking-tight">{amount}</p>
              </div>
            </div>

            {/* Dotted receipt separator */}
            <div className="border-t border-dashed border-border mx-0" />

            {/* PIN entry */}
            <div className="space-y-4 p-6">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  {t.common.payment.pin}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
                    className="font-mono text-center text-xl tracking-[0.6em] pl-10 h-12"
                    onKeyDown={(e) => e.key === "Enter" && handleConfirmPin()}
                  />
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="size-3" />
                  Demo PIN: <span className="font-mono font-semibold">1234</span>
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive font-medium">{error}</p>
              )}

              <div className="flex justify-between gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep("method-and-number");
                    setPin("");
                    setError("");
                  }}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <ArrowLeft className="size-4" />
                  {t.common.payment.back}
                </Button>
                <Button
                  onClick={handleConfirmPin}
                  disabled={busy || pin.length < 4}
                  className={cn(
                    "gap-1.5 bg-gradient-to-r transition-all shadow-md border-0 text-white hover:opacity-90",
                    selectedMethod.gradientFrom,
                    selectedMethod.gradientTo,
                  )}
                >
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
