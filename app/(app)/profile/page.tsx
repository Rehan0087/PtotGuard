"use client";

import { useState } from "react";
import { Check, KeyRound, Loader2, PenLine, User } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { Jurisdiction, User as UserType } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";

type ProfileData = { user: UserType; jurisdiction: Jurisdiction | null };
type FormData = {
  name: string; nameBn: string; email: string; phone: string; avatarUrl: string;
  fatherName: string; motherName: string; birthDate: string; bloodGroup: string;
  gender: string; occupation: string; currentAddress: string; permanentAddress: string;
};

const inputClass = "w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const t = useT().pages.profile;
  const { data, isLoading, isError, refetch } = useQuery<ProfileData>({
    queryKey: ["auth-me"], queryFn: () => api.get<ProfileData>("/auth/me"),
  });
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>();
  const editedAvatarUrl = useWatch({ control, name: "avatarUrl" });

  const updateMutation = useMutation<UserType, Error, FormData>({
    mutationFn: (values) => api.patch<UserType>("/auth/me", {
      name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim(),
      avatarUrl: values.avatarUrl.trim(),
      profileDetails: {
        ...(data?.user.profileDetails ?? {}),
        nameBn: values.nameBn.trim(), fatherName: values.fatherName.trim(),
        motherName: values.motherName.trim(), birthDate: values.birthDate,
        bloodGroup: values.bloodGroup, gender: values.gender,
        occupation: values.occupation.trim(), currentAddress: values.currentAddress.trim(),
        permanentAddress: values.permanentAddress.trim(), address: values.currentAddress.trim(),
      },
    }),
    onSuccess: (user) => {
      queryClient.setQueryData<ProfileData>(["auth-me"], (current) => current ? { ...current, user } : current);
      setIsEditing(false);
      toast.success(t.updateSuccess);
    },
    onError: (error) => toast.error(error instanceof ApiError && error.message ? error.message : t.updateError),
  });

  const startEditing = () => {
    if (!data?.user) return;
    const details = data.user.profileDetails ?? {};
    reset({
      name: data.user.name, nameBn: details.nameBn ?? "", email: data.user.email,
      phone: data.user.phone ?? "", avatarUrl: data.user.avatarUrl ?? "",
      fatherName: details.fatherName ?? "", motherName: details.motherName ?? "",
      birthDate: details.birthDate ?? "", bloodGroup: details.bloodGroup ?? "",
      gender: details.gender ?? "", occupation: details.occupation ?? "",
      currentAddress: details.currentAddress ?? details.address ?? "",
      permanentAddress: details.permanentAddress ?? "",
    });
    setIsEditing(true);
  };
  const cancelEditing = () => { reset(); setIsEditing(false); };

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>;
  if (isError || !data?.user) return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 text-center">
      <p className="text-muted-foreground">{t.updateError}</p>
      <button type="button" onClick={() => refetch()} className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t.verify}</button>
    </div>
  );

  const u = data.user;
  const p = u.profileDetails ?? {};
  const avatarUrl = isEditing ? editedAvatarUrl : u.avatarUrl;
  const show = (value?: string) => value || "—";
  const errorText = (message?: string) => message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
  const field = (label: string, view: string | undefined, control: React.ReactNode) => (
    <div><label className="mb-1 block text-sm font-semibold text-muted-foreground">{label}</label>{isEditing ? control : <p className="min-h-5 text-sm text-card-foreground">{show(view)}</p>}</div>
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 md:flex-row lg:p-8">
      <aside className="w-full flex-shrink-0 space-y-6 md:w-80">
        <div className="flex flex-col items-center rounded-md border border-border bg-card p-6">
          <div className="mb-4 flex size-32 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
            {avatarUrl ? <div role="img" aria-label={u.name} className="size-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(avatarUrl).slice(1, -1)})` }} /> : <User className="size-20 text-muted-foreground" />}
          </div>
          <h2 className="mb-1 text-xl font-semibold text-card-foreground">{u.name}</h2>
          <div className="mb-6 text-center"><p className="text-sm font-medium capitalize text-card-foreground">{u.title || u.role.replaceAll("-", " ")}</p><p className="text-sm text-muted-foreground">{show(u.phone)}</p></div>
          <div className={`w-full rounded py-2 text-center text-sm font-medium text-white ${u.status === "active" ? "bg-emerald-600" : "bg-destructive/90"}`}>{u.status === "active" ? t.activeAccount : t.nonVerifiedAccount}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-6">
          <h3 className="mb-4 text-base font-semibold text-card-foreground">{t.verification}</h3>
          <div className="space-y-4">{[t.nid, t.birthRegistration].map((label, index) => (
            <div key={label} className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded border border-border bg-muted text-xs font-bold text-muted-foreground">{index ? "#" : "ID"}</span><span className="text-sm text-card-foreground">{label}</span></div><button type="button" onClick={() => toast.success(t.verifySuccess)} className="rounded bg-primary/90 px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary">{t.verify}</button></div>
          ))}</div>
        </div>
        <button type="button" onClick={() => toast.info(t.passwordSent)} className="flex w-full items-center justify-center gap-2 rounded bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"><KeyRound className="size-4" />{t.changePassword}</button>
      </aside>

      <form onSubmit={handleSubmit((values) => updateMutation.mutate(values))} className="flex-1 rounded-md border border-border bg-card p-6" noValidate>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div><h1 className="text-2xl font-semibold text-card-foreground">{t.title}</h1><p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t.officialFieldsNote}</p></div>
          {!isEditing ? <button type="button" onClick={startEditing} className="flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><PenLine className="size-4" />{t.updateProfile}</button> : (
            <div className="flex items-center gap-2"><button type="button" onClick={cancelEditing} disabled={updateMutation.isPending} className="rounded bg-muted px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60">{t.cancel}</button><button type="submit" disabled={updateMutation.isPending} className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t.save}</button></div>
          )}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
          {field(t.name, p.nameBn, <input {...register("nameBn")} className={inputClass} />)}
          {field(t.nameEn, u.name, <><input {...register("name", { required: t.requiredField, minLength: { value: 2, message: t.requiredField } })} className={inputClass} aria-invalid={!!errors.name} />{errorText(errors.name?.message)}</>)}
          {field(t.phone, u.phone, <><input type="tel" {...register("phone", { required: t.requiredField, pattern: { value: /^[+()\d\s-]{7,30}$/, message: t.invalidPhone } })} className={inputClass} aria-invalid={!!errors.phone} />{errorText(errors.phone?.message)}</>)}
          {field(t.email, u.email, <><input type="email" {...register("email", { required: t.requiredField, pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t.invalidEmail } })} className={inputClass} aria-invalid={!!errors.email} />{errorText(errors.email?.message)}</>)}
          {field(t.fatherName, p.fatherName, <input {...register("fatherName")} className={inputClass} />)}
          {field(t.motherName, p.motherName, <input {...register("motherName")} className={inputClass} />)}
          {field(t.birthDate, p.birthDate, <input type="date" max={new Date().toISOString().slice(0, 10)} {...register("birthDate")} className={inputClass} />)}
          <div className="grid grid-cols-2 gap-4">
            {field(t.bloodGroup, p.bloodGroup, <select {...register("bloodGroup")} className={inputClass}><option value="">{t.select}</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group}>{group}</option>)}</select>)}
            {field(t.gender, p.gender, <select {...register("gender")} className={inputClass}><option value="">{t.select}</option><option value="Male">{t.male}</option><option value="Female">{t.female}</option></select>)}
          </div>
          {field(t.occupation, p.occupation, <input {...register("occupation")} className={inputClass} />)}
          {field(t.avatarUrl, u.avatarUrl, <><input type="url" placeholder="https://…" {...register("avatarUrl", { validate: (value) => !value || /^https?:\/\//i.test(value) || t.invalidAvatarUrl })} className={inputClass} aria-invalid={!!errors.avatarUrl} />{errorText(errors.avatarUrl?.message)}</>)}
          <div><p className="mb-1 text-sm font-semibold text-muted-foreground">{t.nationalId}</p><p className="min-h-5 text-sm text-card-foreground">{show(u.nationalId)}</p></div>
          <div><p className="mb-1 text-sm font-semibold text-muted-foreground">{t.designation}</p><p className="min-h-5 text-sm text-card-foreground">{show(u.title)}</p></div>
          <div><p className="mb-1 text-sm font-semibold text-muted-foreground">{t.officeJurisdiction}</p><p className="min-h-5 text-sm text-card-foreground">{show(data.jurisdiction?.name)}</p></div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="min-h-[120px] rounded-md border border-border p-4"><label className="mb-2 block text-sm font-semibold text-muted-foreground">{t.currentAddress}</label>{isEditing ? <textarea rows={3} {...register("currentAddress")} className={inputClass} /> : <p className="whitespace-pre-wrap text-sm text-card-foreground">{show(p.currentAddress ?? p.address)}</p>}</div>
          <div className="min-h-[120px] rounded-md border border-border p-4"><label className="mb-2 block text-sm font-semibold text-muted-foreground">{t.permanentAddress}</label>{isEditing ? <textarea rows={3} {...register("permanentAddress")} className={inputClass} /> : <p className="whitespace-pre-wrap text-sm text-card-foreground">{show(p.permanentAddress)}</p>}</div>
        </div>
      </form>
    </div>
  );
}
