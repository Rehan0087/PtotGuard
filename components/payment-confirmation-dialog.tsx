"use client";

import { useState } from "react";
import { CreditCard, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

const METHODS: { value: PaymentMethod; label: "bkash" | "nagad" | "card" }[] = [
  { value: "bkash", label: "bkash" },
  { value: "nagad", label: "nagad" },
  { value: "card", label: "card" },
];

type Props = {
  open: boolean;
  amount: string;
  defaultMethod: PaymentMethod;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (method: PaymentMethod) => void;
};

/**
 * Local-only demo checkout. The account/card fields and PIN deliberately
 * never leave this component; the API receives only the selected method once
 * the user has completed the confirmation step.
 */
export function PaymentConfirmationDialog({
  open,
  amount,
  defaultMethod,
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
  const [error, setError] = useState("");
  const isCard = method === "card";

  function confirm() {
    const digits = account.replace(/\D/g, "");
    if ((isCard && !/^\d{16}$/.test(digits)) || (!isCard && !/^01\d{9}$/.test(digits))) {
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
    if (pin !== "1234") {
      setError(t.common.payment.invalidPin);
      return;
    }
    setError("");
    onConfirm(method);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t.common.payment.title}</DialogTitle>
          <DialogDescription>{t.common.payment.description(amount)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <span className="block text-sm font-medium text-foreground">{t.common.payment.method}</span>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((option) => {
              const Icon = option.value === "card" ? CreditCard : Smartphone;
              return (
                <button
                  type="button"
                  key={option.value}
                  disabled={busy}
                  onClick={() => setMethod(option.value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border p-2 text-sm font-medium",
                    method === option.value ? "border-primary ring-1 ring-primary" : "border-border",
                  )}
                >
                  <Icon className="size-4" />
                  {option.label === "bkash" ? "bKash" : option.label === "nagad" ? "Nagad" : "Card"}
                </button>
              );
            })}
          </div>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-foreground">
              {isCard ? t.common.payment.cardNumber : t.common.payment.mobileNumber}
            </span>
            <Input
              inputMode="numeric"
              autoComplete={isCard ? "cc-number" : "tel"}
              placeholder={isCard ? t.common.payment.cardPlaceholder : t.common.payment.mobilePlaceholder}
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              disabled={busy}
            />
          </label>

          {isCard ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-foreground">{t.common.payment.expiry}</span>
                <Input placeholder={t.common.payment.expiryPlaceholder} value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={busy} />
              </label>
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-foreground">{t.common.payment.cvv}</span>
                <Input inputMode="numeric" type="password" maxLength={4} value={cvv} onChange={(event) => setCvv(event.target.value)} disabled={busy} />
              </label>
            </div>
          ) : null}

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-foreground">{t.common.payment.pin}</span>
            <Input inputMode="numeric" type="password" maxLength={4} placeholder={t.common.payment.pinPlaceholder} value={pin} onChange={(event) => setPin(event.target.value)} disabled={busy} />
          </label>
          <p className="text-xs text-muted-foreground">{t.common.payment.demoPinHint}</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t.common.cancel}</Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? t.common.payment.verifying : t.common.payment.pay(amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
