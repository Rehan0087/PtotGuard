"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { IdChip } from "@/components/id-chip";
import { StatusMetaBadge } from "@/components/status-badge";
import { useStatusMeta } from "@/lib/i18n/status";
import { useFmt } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { ApiError } from "@/lib/api-client";
import {
  useSession,
  useLandListing,
  useCreateLandListingInquiry,
  useWithdrawLandListingInquiry,
} from "@/hooks/queries";

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const f = useFmt();
  const s = useStatusMeta();
  const { data: session } = useSession();
  const { data: listing, isLoading } = useLandListing(id);
  const [message, setMessage] = useState("");
  const inquire = useCreateLandListingInquiry(id);
  const withdraw = useWithdrawLandListingInquiry(id);

  if (isLoading || !listing) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const isSeller = listing.sellerId === session?.user.id;
  const myInquiry = listing.inquiries.find((i) => i.buyerId === session?.user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.nav.portals.citizen} title={t.nav.marketplace}>
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.nav.marketplace}
        </Link>
      </PageHeader>

      <Card className="gap-4 px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <IdChip icon={MapPin}>{listing.parcel.dagNo}</IdChip>
            <p className="text-sm text-muted-foreground">{t.pages.marketplace.bySeller(listing.seller.name)}</p>
          </div>
          <div className="text-right">
            <div className="tabular font-heading text-2xl font-semibold text-foreground">
              {f.money({ amount: listing.askingPriceBdt, currency: "BDT" })}
            </div>
            <StatusMetaBadge meta={s.landListing[listing.status]} />
          </div>
        </div>

        <p className="text-pretty text-sm text-foreground">{listing.description}</p>

        <div className="border-t border-border pt-3">
          <Link href={`/parcels/${listing.parcelId}`} className="text-sm text-primary hover:underline">
            {listing.parcel.title} · {listing.parcel.khatianNo}
          </Link>
        </div>
      </Card>

      {isSeller ? (
        <Card className="px-5 py-4 text-sm text-muted-foreground">
          <Link href="/marketplace" className="text-primary hover:underline">
            {t.pages.marketplace.tabs.mine}
          </Link>
        </Card>
      ) : myInquiry ? (
        <Card className="gap-3 px-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t.pages.marketplace.interestFormTitle}</span>
            <StatusMetaBadge meta={s.landListingInquiry[myInquiry.status]} />
          </div>
          {myInquiry.message ? <p className="text-sm text-muted-foreground">{myInquiry.message}</p> : null}
          {myInquiry.status === "open" ? (
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate(myInquiry.id)}
            >
              {t.pages.marketplace.withdrawInterest}
            </Button>
          ) : null}
        </Card>
      ) : listing.status === "active" ? (
        <Card className="gap-4 px-5">
          <div className="text-sm font-medium text-foreground">{t.pages.marketplace.interestFormTitle}</div>
          <div>
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-foreground">
              {t.pages.marketplace.messageLabel}
            </label>
            <Textarea
              id="message"
              rows={3}
              placeholder={t.pages.marketplace.messagePlaceholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="w-fit"
            disabled={inquire.isPending}
            onClick={() =>
              inquire.mutate(
                { message: message.trim() || undefined },
                {
                  onSuccess: () => {
                    toast.success(t.pages.marketplace.interestSentTitle, {
                      description: t.pages.marketplace.interestSentBody,
                    });
                  },
                  onError: (error) => {
                    toast.error(t.pages.marketplace.failedTitle, {
                      description:
                        error instanceof ApiError ? error.message : t.pages.marketplace.failedBody,
                    });
                  },
                },
              )
            }
          >
            {inquire.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t.pages.marketplace.sendInterest}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
