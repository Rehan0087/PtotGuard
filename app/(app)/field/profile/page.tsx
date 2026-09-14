"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { AtSign, BadgeCheck, Building2, IdCard, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession, useUpdateOwnProfile } from "@/hooks/queries";
import { ApiError } from "@/lib/api-client";
import {
  fieldProfilePayload,
  validateFieldProfile,
  type FieldProfileFormValues,
} from "@/lib/field-profile";
import { initials } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

function ReadOnlyItem({ icon: Icon, label, value }: { icon: typeof IdCard; label: string; value?: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-muted/45 px-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-marker" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate text-sm font-medium text-foreground">{value || "—"}</div>
      </div>
    </div>
  );
}

export default function FieldProfilePage() {
  const dictionary = useT();
  const t = dictionary.pages.fieldProfile;
  const session = useSession();
  const update = useUpdateOwnProfile();
  const form = useForm<FieldProfileFormValues>({
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      avatarUrl: "",
      currentAddress: "",
      emergencyContact: "",
    },
  });
  const user = session.data?.user;
  const details = user?.profileDetails ?? {};

  useEffect(() => {
    if (!user) return;
    form.reset({
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      avatarUrl: user.avatarUrl ?? "",
      currentAddress: details.currentAddress ?? "",
      emergencyContact: details.emergencyContact ?? "",
    });
  }, [details.currentAddress, details.emergencyContact, form, user]);

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors();
    const invalid = validateFieldProfile(values);
    if (invalid.length) {
      for (const field of invalid) form.setError(field, { message: t.errors[field] });
      return;
    }
    try {
      await update.mutateAsync(fieldProfilePayload(values));
      toast.success(t.updated);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        (error.reason as { code?: string } | undefined)?.code === "email-in-use"
      ) {
        form.setError("email", { message: t.errors.emailInUse });
        return;
      }
      toast.error(t.updateFailed);
    }
  });

  if (session.isLoading) {
    return <div className="space-y-6"><Skeleton className="h-20" /><Skeleton className="h-96 rounded-xl" /></div>;
  }
  if (session.isError || !user) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{dictionary.common.somethingWentWrong}</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{dictionary.common.tryAgain}</p>
          <Button size="sm" variant="outline" onClick={() => void session.refetch()}>{dictionary.common.retry}</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description}>
        <Badge variant="secondary"><ShieldCheck />{t.roleLocked}</Badge>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center py-4 text-center">
              <Avatar className="size-20">
                {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-4 text-lg font-semibold text-foreground">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.title ?? dictionary.roles[user.role]}</p>
              <Badge className="mt-3" variant={user.status === "active" ? "default" : "destructive"}>
                <BadgeCheck />{dictionary.status.user[user.status]}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.managedTitle}</CardTitle>
              <CardDescription>{t.managedDescription}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2.5">
              <ReadOnlyItem icon={ShieldCheck} label={t.role} value={dictionary.roles[user.role]} />
              <ReadOnlyItem icon={UserRound} label={t.designation} value={user.title} />
              <ReadOnlyItem icon={Building2} label={t.jurisdiction} value={session.data?.jurisdiction?.name} />
              <ReadOnlyItem icon={IdCard} label={t.employeeId} value={details.employeeCode ?? user.id} />
              <ReadOnlyItem icon={IdCard} label={t.nationalId} value={user.nationalId} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>{t.contactTitle}</CardTitle>
            <CardDescription>{t.contactDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={submit} noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="field-profile-name">{t.name}</Label>
                  <Input id="field-profile-name" autoComplete="name" {...form.register("name")} aria-invalid={Boolean(form.formState.errors.name)} />
                  {form.formState.errors.name ? <p className="text-xs text-destructive">{form.formState.errors.name.message}</p> : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="field-profile-email">{t.email}</Label>
                  <Input id="field-profile-email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={Boolean(form.formState.errors.email)} />
                  {form.formState.errors.email ? <p className="text-xs text-destructive">{form.formState.errors.email.message}</p> : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="field-profile-phone">{t.phone}</Label>
                  <Input id="field-profile-phone" type="tel" autoComplete="tel" {...form.register("phone")} aria-invalid={Boolean(form.formState.errors.phone)} />
                  {form.formState.errors.phone ? <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p> : null}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="field-profile-emergency">{t.emergencyContact}</Label>
                  <Input id="field-profile-emergency" type="tel" {...form.register("emergencyContact")} aria-invalid={Boolean(form.formState.errors.emergencyContact)} />
                  {form.formState.errors.emergencyContact ? <p className="text-xs text-destructive">{form.formState.errors.emergencyContact.message}</p> : null}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="field-profile-avatar">{t.avatarUrl}</Label>
                <div className="relative"><AtSign className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input id="field-profile-avatar" className="pl-9" type="url" placeholder="https://" {...form.register("avatarUrl")} aria-invalid={Boolean(form.formState.errors.avatarUrl)} /></div>
                {form.formState.errors.avatarUrl ? <p className="text-xs text-destructive">{form.formState.errors.avatarUrl.message}</p> : <p className="text-xs text-muted-foreground">{t.avatarHint}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="field-profile-address">{t.currentAddress}</Label>
                <Textarea id="field-profile-address" rows={4} {...form.register("currentAddress")} aria-invalid={Boolean(form.formState.errors.currentAddress)} />
                {form.formState.errors.currentAddress ? <p className="text-xs text-destructive">{form.formState.errors.currentAddress.message}</p> : null}
              </div>
              <div className="flex justify-end border-t pt-4">
                <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
                  <Save className="size-4" />{update.isPending ? t.saving : t.save}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
