"use client";

import { useState } from "react";
import { User, PenLine, KeyRound, Check, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { User as UserType } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";

type ProfileData = {
  user: UserType;
  jurisdiction: any;
};

type FormData = {
  phone: string;
  fatherName: string;
  motherName: string;
  birthDate: string;
  bloodGroup: string;
  gender: string;
  occupation: string;
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const t = useT().pages.profile;

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["auth-me"],
    queryFn: () => api.get<ProfileData>("/auth/me"),
  });

  const updateMutation = useMutation({
    mutationFn: (values: FormData) =>
      api.patch("/auth/me", {
        phone: values.phone,
        profileDetails: {
          fatherName: values.fatherName,
          motherName: values.motherName,
          birthDate: values.birthDate,
          bloodGroup: values.bloodGroup,
          gender: values.gender,
          occupation: values.occupation,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      setIsEditing(false);
      toast.success(t.updateSuccess);
    },
    onError: () => {
      toast.error(t.updateError);
    },
  });

  const { register, handleSubmit, reset } = useForm<FormData>();

  const startEditing = () => {
    if (data?.user) {
      reset({
        phone: data.user.phone || "",
        fatherName: data.user.profileDetails?.fatherName || "",
        motherName: data.user.profileDetails?.motherName || "",
        birthDate: data.user.profileDetails?.birthDate || "",
        bloodGroup: data.user.profileDetails?.bloodGroup || "",
        gender: data.user.profileDetails?.gender || "",
        occupation: data.user.profileDetails?.occupation || "",
      });
      setIsEditing(true);
    }
  };

  const onSubmit = (values: FormData) => {
    updateMutation.mutate(values);
  };

  const handleVerify = () => {
    toast.success(t.verifySuccess);
  };

  const handleChangePassword = () => {
    toast.info(t.passwordSent);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const u = data?.user;
  const p = (u?.profileDetails as any) || {};

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Left Sidebar Profile Card */}
      <div className="w-full md:w-80 flex-shrink-0 space-y-6">
        <div className="bg-card rounded-md border border-border p-6 flex flex-col items-center">
          <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center overflow-hidden mb-4 border border-border">
            <User className="w-20 h-20 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-card-foreground mb-1">{u?.name}</h2>
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-card-foreground capitalize">{u?.role}</p>
            <p className="text-sm text-muted-foreground">{u?.phone}</p>
          </div>
          <button className={`w-full py-2 rounded text-sm font-medium transition-colors ${u?.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-destructive/90 hover:bg-destructive text-destructive-foreground'}`}>
            {u?.status === 'active' ? t.activeAccount : t.nonVerifiedAccount}
          </button>
        </div>

        <div className="bg-card rounded-md border border-border p-6">
          <h3 className="text-base font-semibold text-card-foreground mb-4">{t.verification}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold border border-border">ID</span>
                <span className="text-sm text-card-foreground">{t.nid}</span>
              </div>
              <button onClick={handleVerify} className="bg-primary/90 hover:bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded transition-colors">
                {t.verify}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold border border-border">#</span>
                <span className="text-sm text-card-foreground">{t.birthRegistration}</span>
              </div>
              <button onClick={handleVerify} className="bg-primary/90 hover:bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded transition-colors">
                {t.verify}
              </button>
            </div>
          </div>
        </div>

        <button onClick={handleChangePassword} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors">
          <KeyRound className="w-4 h-4" />
          {t.changePassword}
        </button>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 bg-card rounded-md border border-border p-6">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
          <h1 className="text-2xl font-semibold text-card-foreground">{t.title}</h1>
          {!isEditing ? (
            <button onClick={startEditing} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors">
              <PenLine className="w-4 h-4" />
              {t.updateProfile}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setIsEditing(false)} className="bg-muted hover:bg-muted/80 text-foreground px-4 py-2 rounded text-sm font-medium transition-colors">
                {t.cancel}
              </button>
              <button onClick={handleSubmit(onSubmit)} disabled={updateMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-70">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t.save}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-10">
          {/* Row 1 */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.name}</p>
            <p className="text-sm text-card-foreground min-h-[20px]">{u?.name}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.nameEn}</p>
            <p className="text-sm text-card-foreground">{u?.name}</p>
          </div>

          {/* Row 2 */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.phone}</p>
            {isEditing ? (
              <input {...register("phone")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm" />
            ) : (
              <p className="text-sm text-card-foreground">{u?.phone}</p>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.email}</p>
            <p className="text-sm text-card-foreground min-h-[20px]">{u?.email}</p>
          </div>

          {/* Row 3 */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.fatherName}</p>
            {isEditing ? (
              <input {...register("fatherName")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm" />
            ) : (
              <p className="text-sm text-card-foreground min-h-[20px]">{p?.fatherName}</p>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.motherName}</p>
            {isEditing ? (
              <input {...register("motherName")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm" />
            ) : (
              <p className="text-sm text-card-foreground min-h-[20px]">{p?.motherName}</p>
            )}
          </div>

          {/* Row 4 */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.birthDate}</p>
            {isEditing ? (
              <input type="date" {...register("birthDate")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm" />
            ) : (
              <p className="text-sm text-card-foreground min-h-[20px]">{p?.birthDate}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-1">{t.bloodGroup}</p>
              {isEditing ? (
                <input {...register("bloodGroup")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm" />
              ) : (
                <p className="text-sm text-card-foreground min-h-[20px]">{p?.bloodGroup}</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-1">{t.gender}</p>
              {isEditing ? (
                <select {...register("gender")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm">
                  <option value="">{t.select}</option>
                  <option value="Male">{t.male}</option>
                  <option value="Female">{t.female}</option>
                </select>
              ) : (
                <p className="text-sm text-card-foreground min-h-[20px]">{p?.gender}</p>
              )}
            </div>
          </div>

          {/* Row 5 */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.nationalId}</p>
            <p className="text-sm text-card-foreground min-h-[20px]">{u?.nationalId}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1">{t.occupation}</p>
            {isEditing ? (
              <input {...register("occupation")} className="w-full border border-input bg-background text-foreground rounded px-3 py-1.5 text-sm" />
            ) : (
              <p className="text-sm text-card-foreground min-h-[20px]">{p?.occupation}</p>
            )}
          </div>
        </div>

        {/* Addresses Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-border rounded-md p-4 min-h-[120px]">
            <p className="text-sm font-semibold text-muted-foreground mb-2">{t.currentAddress}</p>
            <p className="text-sm text-card-foreground">কুমিল্লা, বাংলাদেশ</p>
          </div>
          <div className="border border-border rounded-md p-4 min-h-[120px]">
            <p className="text-sm font-semibold text-muted-foreground mb-2">{t.permanentAddress}</p>
            <p className="text-sm text-card-foreground">কুমিল্লা, বাংলাদেশ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
