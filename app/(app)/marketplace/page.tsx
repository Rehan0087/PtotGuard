"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle, Check, Loader2, MapPin, Plus, Store, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { useStatusMeta } from "@/lib/i18n/status";
import { ApiError } from "@/lib/api-client";
import type { Dictionary } from "@/lib/i18n";
import {
  useParcels,
  useLandListings,
  useMyLandListings,
  useMyLandListingInquiries,
  useCreateLandListing,
  useWithdrawLandListing,
  useReactivateLandListing,
  useAcceptLandListingInquiry,
  useDeclineLandListingInquiry,
  useWithdrawLandListingInquiry,
  type LandListingSummary,
  type LandListingWithInquiries,
  type MyLandListingInquiryRow,
} from "@/hooks/queries";

function makeSchema(t: Dictionary) {
  return z.object({
    parcelId: z.string().min(1, t.pages.marketplace.errors.parcelRequired),
    askingPriceBdt: z.number({ error: t.pages.marketplace.errors.priceRequired }).int().min(1, t.pages.marketplace.errors.priceRequired),
    description: z.string().min(1, t.pages.marketplace.errors.descriptionRequired),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function errorToast(t: Dictionary, error: unknown) {
  const code =
    error instanceof ApiError && typeof (error.reason as { code?: string })?.code === "string"
      ? (error.reason as { code: string }).code
      : undefined;
  const blockers =
    error instanceof ApiError
      ? ((error.reason as { blockers?: { code: string }[] })?.blockers ?? [])
      : [];
  const specific =
    code === "not-listable"
      ? blockers.some((b) => b.code === "restricted")
        ? t.pages.marketplace.errors.restricted
        : blockers.some((b) => b.code === "already-listed")
          ? t.pages.marketplace.errors.alreadyListed
          : undefined
      : undefined;

  toast.error(t.pages.marketplace.failedTitle, { description: specific ?? t.pages.marketplace.failedBody });
}

// --- Browse --------------------------------------------------------------

function BrowseCard({ listing }: { listing: LandListingSummary }) {
  const t = useT();
  const f = useFmt();

  return (
    <Link href={`/marketplace/${listing.id}`} className="block">
      <Card className="gap-3 px-5 transition-colors hover:bg-muted/50">
        <div className="flex items-start justify-between gap-3">
          <IdChip icon={MapPin}>{listing.parcel.dagNo}</IdChip>
          <span className="tabular font-heading text-lg font-semibold text-foreground">
            {f.money({ amount: listing.askingPriceBdt, currency: "BDT" })}
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{t.pages.marketplace.bySeller(listing.seller.name)}</span>
          <time dateTime={listing.createdAt}>{f.fromNow(listing.createdAt)}</time>
        </div>
      </Card>
    </Link>
  );
}

function BrowseTab() {
  const t = useT();
  const { data, isLoading } = useLandListings({ pageSize: 50 });
  const listings = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title={t.pages.marketplace.browseEmptyTitle}
        description={t.pages.marketplace.browseEmptyBody}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <BrowseCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

// --- My listings -----------------------------------------------------------

function CreateListingForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const schema = useMemo(() => makeSchema(t), [t]);
  const parcelsQ = useParcels({ owner: "me", pageSize: 100 });
  const parcels = parcelsQ.data?.items ?? [];
  const create = useCreateLandListing();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { parcelId: "", askingPriceBdt: 0, description: "" },
  });

  const parcelId = useWatch({ control, name: "parcelId" });

  function onSubmit(values: FormValues) {
    create.mutate(values, {
      onSuccess: () => {
        toast.success(t.pages.marketplace.listedTitle, { description: t.pages.marketplace.listedBody });
        onDone();
      },
      onError: (error) => errorToast(t, error),
    });
  }

  return (
    <Card className="gap-4 px-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">{t.pages.marketplace.parcelLabel}</label>
          {parcelsQ.isLoading ? (
            <Skeleton className="h-11 rounded-lg" />
          ) : parcels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.pages.marketplace.parcelPlaceholder}</p>
          ) : (
            <div className="grid gap-1.5">
              {parcels.map((p) => {
                const active = parcelId === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setValue("parcelId", p.id, { shouldValidate: true })}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors",
                      active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <IdChip icon={MapPin}>{p.dagNo}</IdChip>
                    <span className="truncate text-muted-foreground">{p.title}</span>
                    {active ? <Check className="ml-auto size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          )}
          {errors.parcelId ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {errors.parcelId.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="askingPriceBdt" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.marketplace.askingPriceLabel}
          </label>
          <input
            id="askingPriceBdt"
            type="number"
            min={1}
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("askingPriceBdt", { valueAsNumber: true })}
          />
          {errors.askingPriceBdt ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.askingPriceBdt.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-foreground">
            {t.pages.marketplace.descriptionLabel}
          </label>
          <Textarea
            id="description"
            rows={3}
            placeholder={t.pages.marketplace.descriptionPlaceholder}
            {...register("description")}
          />
          {errors.description ? (
            <p className="mt-1.5 text-sm text-destructive">{errors.description.message}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t.pages.marketplace.submitListing}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={create.isPending}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function InquiryRow({ listing }: { listing: LandListingWithInquiries }) {
  const t = useT();
  const s = useStatusMeta();
  const router = useRouter();
  const accept = useAcceptLandListingInquiry(listing.id);
  const decline = useDeclineLandListingInquiry(listing.id);
  const [busy, setBusy] = useState<string | null>(null);

  const openInquiries = listing.inquiries.filter((i) => i.status === "open");
  if (listing.inquiries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.pages.marketplace.noInquiriesYet}</p>;
  }

  return (
    <div className="space-y-2">
      {listing.inquiries.map((inquiry) => (
        <div
          key={inquiry.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5 text-sm"
        >
          <div className="min-w-0">
            <span className="font-medium text-foreground">{inquiry.buyer.name}</span>
            {inquiry.message ? (
              <p className="truncate text-xs text-muted-foreground">{inquiry.message}</p>
            ) : null}
          </div>
          {inquiry.status === "open" && openInquiries[0]?.id === inquiry.id ? (
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                disabled={accept.isPending || decline.isPending}
                onClick={() => {
                  setBusy(inquiry.id);
                  accept.mutate(inquiry.id, {
                    onSuccess: (result) => {
                      toast.success(t.pages.marketplace.acceptedTitle, {
                        description: t.pages.marketplace.acceptedBody,
                      });
                      const params = new URLSearchParams({
                        parcelId: listing.parcelId,
                        toOwnerId: result.buyerId,
                        toOwnerName: result.inquiry.buyer.name,
                      });
                      router.push(`/mutations/new?${params.toString()}`);
                    },
                    onError: (error) => {
                      setBusy(null);
                      errorToast(t, error);
                    },
                  });
                }}
              >
                {busy === inquiry.id && accept.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                {t.pages.marketplace.accept}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={accept.isPending || decline.isPending}
                onClick={() => {
                  setBusy(inquiry.id);
                  decline.mutate(inquiry.id, { onSuccess: () => setBusy(null), onError: () => setBusy(null) });
                }}
              >
                {busy === inquiry.id && decline.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <X className="size-3.5" />
                )}
                {t.pages.marketplace.decline}
              </Button>
            </div>
          ) : (
            <StatusMetaBadge meta={s.landListingInquiry[inquiry.status]} />
          )}
        </div>
      ))}
    </div>
  );
}

function MyListingCard({ listing }: { listing: LandListingWithInquiries }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const withdraw = useWithdrawLandListing(listing.id);
  const reactivate = useReactivateLandListing(listing.id);

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdChip icon={MapPin}>{listing.parcel.dagNo}</IdChip>
            <span className="tabular text-sm font-medium text-foreground">
              {f.money({ amount: listing.askingPriceBdt, currency: "BDT" })}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{listing.description}</p>
        </div>
        <StatusMetaBadge meta={s.landListing[listing.status]} />
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">{t.pages.marketplace.inquiriesLabel}</div>
        <InquiryRow listing={listing} />
      </div>

      {listing.status === "sold" ? null : (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          {listing.status !== "withdrawn" ? (
            <Button size="xs" variant="outline" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
              {t.pages.marketplace.withdrawListing}
            </Button>
          ) : (
            <Button size="xs" variant="outline" disabled={reactivate.isPending} onClick={() => reactivate.mutate()}>
              {t.pages.marketplace.reactivateListing}
            </Button>
          )}
          {listing.status === "under-transfer" ? (
            <Button
              size="xs"
              nativeButton={false}
              render={
                <Link
                  href={`/mutations/new?parcelId=${listing.parcelId}`}
                />
              }
            >
              {t.pages.marketplace.continueToMutation}
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function MyListingsTab() {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useMyLandListings();
  const listings = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t.pages.marketplace.newListing}
          </Button>
        )}
      </div>

      {creating ? <CreateListingForm onDone={() => setCreating(false)} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        creating ? null : (
          <EmptyState
            icon={Store}
            title={t.pages.marketplace.minesEmptyTitle}
            description={t.pages.marketplace.minesEmptyBody}
          />
        )
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <MyListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- My interests ------------------------------------------------------

function InterestCard({ inquiry }: { inquiry: MyLandListingInquiryRow }) {
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const withdraw = useWithdrawLandListingInquiry(inquiry.listingId);

  return (
    <Card className="gap-3 px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/marketplace/${inquiry.listingId}`} className="hover:underline">
              <IdChip icon={MapPin}>{inquiry.listing.parcel.dagNo}</IdChip>
            </Link>
            <span className="tabular text-sm font-medium text-foreground">
              {f.money({ amount: inquiry.listing.askingPriceBdt, currency: "BDT" })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t.pages.marketplace.bySeller(inquiry.listing.seller.name)}</p>
        </div>
        <StatusMetaBadge meta={s.landListingInquiry[inquiry.status]} />
      </div>
      {inquiry.status === "open" ? (
        <div className="border-t border-border pt-3">
          <Button size="xs" variant="outline" disabled={withdraw.isPending} onClick={() => withdraw.mutate(inquiry.id)}>
            {t.pages.marketplace.withdrawInterest}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function MyInterestsTab() {
  const t = useT();
  const { data, isLoading } = useMyLandListingInquiries();
  const inquiries = data ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (inquiries.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title={t.pages.marketplace.interestsEmptyTitle}
        description={t.pages.marketplace.interestsEmptyBody}
      />
    );
  }

  return (
    <div className="space-y-3">
      {inquiries.map((inquiry) => (
        <InterestCard key={inquiry.id} inquiry={inquiry} />
      ))}
    </div>
  );
}

// --- Page ------------------------------------------------------------------

export default function MarketplacePage() {
  const t = useT();
  const [tab, setTab] = useState("browse");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.nav.portals.citizen}
        title={t.nav.marketplace}
        description={t.pages.marketplace.description}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          <TabsTrigger value="browse">{t.pages.marketplace.tabs.browse}</TabsTrigger>
          <TabsTrigger value="mine">{t.pages.marketplace.tabs.mine}</TabsTrigger>
          <TabsTrigger value="interests">{t.pages.marketplace.tabs.interests}</TabsTrigger>
        </TabsList>
        <TabsContent value="browse" className="pt-4">
          <BrowseTab />
        </TabsContent>
        <TabsContent value="mine" className="pt-4">
          <MyListingsTab />
        </TabsContent>
        <TabsContent value="interests" className="pt-4">
          <MyInterestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
