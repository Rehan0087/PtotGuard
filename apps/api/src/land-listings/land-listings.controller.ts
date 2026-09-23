import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  canDecideInquiry,
  canListParcel,
  canWithdrawInquiry,
  listingTransition,
  type LandListingInquiryStatus,
  type LandListingStatus,
  type ParcelRestriction,
} from "@plotguard/rules";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginated } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { CreateListingDto } from "./create-listing.dto";
import { CreateInquiryDto } from "./create-inquiry.dto";

const PARCEL_SUMMARY = {
  select: {
    id: true,
    ulpin: true,
    dagNo: true,
    khatianNo: true,
    title: true,
    landUse: true,
    area: true,
    jurisdictionId: true,
  },
} as const;

const SELLER_SUMMARY = { select: { id: true, name: true } } as const;

/**
 * The land marketplace: a citizen lists a parcel they own, other citizens
 * browse and express interest, and the seller picks one inquiry to carry
 * into the existing Mutation ("sale") flow — see mutations.controller.ts.
 * This module never touches ownership itself; accepting an inquiry only
 * moves the listing to "under-transfer" and hands the buyer's id back to
 * the frontend to deep-link into /mutations/new.
 */
@Controller("land-listings")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("citizen")
export class LandListingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async browse(@Query() query: Record<string, string>) {
    const params = pageParams(query);
    const where = {
      status: "active",
      ...(query.landUse ? { parcel: { landUse: query.landUse } } : {}),
      ...(query.q
        ? { description: { contains: query.q, mode: "insensitive" as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.landListing.findMany({
        where,
        include: { parcel: PARCEL_SUMMARY, seller: SELLER_SUMMARY },
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.landListing.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  @Get("mine")
  async mine(@Req() req: Request) {
    return this.prisma.landListing.findMany({
      where: { sellerId: currentUserId(req) },
      include: {
        parcel: PARCEL_SUMMARY,
        inquiries: { include: { buyer: SELLER_SUMMARY }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  @Get("inquiries/mine")
  async myInquiries(@Req() req: Request) {
    return this.prisma.landListingInquiry.findMany({
      where: { buyerId: currentUserId(req) },
      include: { listing: { include: { parcel: PARCEL_SUMMARY, seller: SELLER_SUMMARY } } },
      orderBy: { createdAt: "desc" },
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Req() req: Request) {
    const me = currentUserId(req);
    const listing = await this.prisma.landListing.findUnique({
      where: { id },
      include: {
        parcel: PARCEL_SUMMARY,
        seller: SELLER_SUMMARY,
        inquiries: { include: { buyer: SELLER_SUMMARY }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!listing) throw new NotFoundError("Listing not found");

    const isSeller = listing.sellerId === me;
    return {
      ...listing,
      inquiries: isSeller
        ? listing.inquiries
        : listing.inquiries.filter((i) => i.buyerId === me),
    };
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: CreateListingDto, @Req() req: Request) {
    const me = currentUserId(req);
    const [parcel, restrictions, openListing] = await Promise.all([
      this.prisma.parcel.findUnique({ where: { id: body.parcelId } }),
      this.prisma.parcelRestriction.findMany({ where: { parcelId: body.parcelId } }),
      this.prisma.landListing.findFirst({
        where: { parcelId: body.parcelId, status: { in: ["active", "under-transfer"] } },
      }),
    ]);
    if (!parcel) throw new NotFoundError("Parcel not found");
    // Same answer for "no such parcel" and "not yours" as land-admin: a
    // listing is the owner's to make, and distinguishing the two would
    // confirm a stranger's holding.
    if (parcel.ownerId !== me) throw new NotFoundError("Parcel not found");

    const review = canListParcel(restrictions as unknown as ParcelRestriction[], !!openListing);
    if (!review.canList) throw new ValidationError({ code: "not-listable", blockers: review.blockers }, "parcelId");

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.landListing.create({
        data: {
          id: `ll-${randomUUID()}`,
          parcelId: parcel.id,
          sellerId: me,
          askingPriceBdt: body.askingPriceBdt,
          description: body.description,
        },
        include: { parcel: PARCEL_SUMMARY, seller: SELLER_SUMMARY },
      });

      await this.audit.append(tx, {
        entityType: "land-listing",
        entityId: created.id,
        action: "create",
        actorId: me,
        payload: { parcelDagNo: parcel.dagNo, askingPriceBdt: body.askingPriceBdt },
      });

      return created;
    });
  }

  @Patch(":id/withdraw")
  withdraw(@Param("id") id: string, @Req() req: Request) {
    return this.transitionListing(id, req, "withdrawn");
  }

  @Patch(":id/reactivate")
  reactivate(@Param("id") id: string, @Req() req: Request) {
    return this.transitionListing(id, req, "active");
  }

  private async transitionListing(id: string, req: Request, to: LandListingStatus) {
    const me = currentUserId(req);
    const listing = await this.prisma.landListing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundError("Listing not found");
    if (listing.sellerId !== me) throw new NotFoundError("Listing not found");

    const review = listingTransition(listing.status as LandListingStatus, to);
    if (!review.canChange) throw new ValidationError({ code: "illegal-transition", blockers: review.blockers });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.landListing.update({
        where: { id },
        data: { status: to },
        include: { parcel: PARCEL_SUMMARY, seller: SELLER_SUMMARY },
      });

      await this.audit.append(tx, {
        entityType: "land-listing",
        entityId: id,
        action: "status-change",
        actorId: me,
        payload: { from: listing.status, to },
      });

      return updated;
    });
  }

  @Post(":id/inquiries")
  @HttpCode(201)
  async inquire(@Param("id") id: string, @Body() body: CreateInquiryDto, @Req() req: Request) {
    const me = currentUserId(req);
    const listing = await this.prisma.landListing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundError("Listing not found");
    if (listing.sellerId === me) throw new ValidationError({ code: "own-listing" });
    if (listing.status !== "active") throw new ValidationError({ code: "listing-not-active", status: listing.status });

    const existingOpen = await this.prisma.landListingInquiry.findFirst({
      where: { listingId: id, buyerId: me, status: "open" },
    });
    if (existingOpen) throw new ConflictError("You already have an open inquiry on this listing.");

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.landListingInquiry.create({
        data: { id: `lli-${randomUUID()}`, listingId: id, buyerId: me, message: body.message },
        include: { buyer: SELLER_SUMMARY },
      });

      await this.audit.append(tx, {
        entityType: "land-listing-inquiry",
        entityId: created.id,
        action: "create",
        actorId: me,
        payload: { listingId: id },
      });

      await tx.appNotification.create({
        data: {
          id: `ntf-${randomUUID()}`,
          userId: listing.sellerId,
          severity: "info",
          title: "New interest in your listing",
          body: "Someone expressed interest in a parcel you have listed for sale.",
          read: false,
          href: `/marketplace/${id}`,
        },
      });

      return created;
    });
  }

  @Patch(":id/inquiries/:inquiryId/accept")
  acceptInquiry(@Param("id") id: string, @Param("inquiryId") inquiryId: string, @Req() req: Request) {
    return this.decideInquiry(id, inquiryId, req, "accepted");
  }

  @Patch(":id/inquiries/:inquiryId/decline")
  declineInquiry(@Param("id") id: string, @Param("inquiryId") inquiryId: string, @Req() req: Request) {
    return this.decideInquiry(id, inquiryId, req, "declined");
  }

  private async decideInquiry(
    id: string,
    inquiryId: string,
    req: Request,
    to: Extract<LandListingInquiryStatus, "accepted" | "declined">,
  ) {
    const me = currentUserId(req);
    const [listing, inquiry] = await Promise.all([
      this.prisma.landListing.findUnique({ where: { id } }),
      this.prisma.landListingInquiry.findUnique({ where: { id: inquiryId } }),
    ]);
    if (!listing || !inquiry || inquiry.listingId !== id) throw new NotFoundError("Inquiry not found");
    if (listing.sellerId !== me) throw new NotFoundError("Inquiry not found");

    const review = canDecideInquiry(listing.status as LandListingStatus, inquiry.status as LandListingInquiryStatus);
    if (!review.canDecide) throw new ValidationError({ code: "cannot-decide", blocker: review.blocker });

    return this.prisma.$transaction(async (tx) => {
      const updatedInquiry = await tx.landListingInquiry.update({
        where: { id: inquiryId },
        data: { status: to },
        include: { buyer: SELLER_SUMMARY },
      });

      if (to === "accepted") {
        await tx.landListingInquiry.updateMany({
          where: { listingId: id, status: "open", NOT: { id: inquiryId } },
          data: { status: "declined" },
        });
        await tx.landListing.update({ where: { id }, data: { status: "under-transfer" } });
      }

      await this.audit.append(tx, {
        entityType: "land-listing-inquiry",
        entityId: inquiryId,
        action: "status-change",
        actorId: me,
        payload: { to },
      });

      await tx.appNotification.create({
        data: {
          id: `ntf-${randomUUID()}`,
          userId: inquiry.buyerId,
          severity: to === "accepted" ? "success" : "info",
          title: to === "accepted" ? "Your interest was accepted" : "Your interest was declined",
          body:
            to === "accepted"
              ? "The seller accepted your interest. They will file the ownership transfer next."
              : "The seller has declined your interest in this listing.",
          read: false,
          href: `/marketplace/${id}`,
        },
      });

      return { inquiry: updatedInquiry, buyerId: inquiry.buyerId };
    });
  }

  @Patch(":id/inquiries/:inquiryId/withdraw")
  async withdrawInquiry(@Param("id") id: string, @Param("inquiryId") inquiryId: string, @Req() req: Request) {
    const me = currentUserId(req);
    const inquiry = await this.prisma.landListingInquiry.findUnique({ where: { id: inquiryId } });
    if (!inquiry || inquiry.listingId !== id) throw new NotFoundError("Inquiry not found");
    if (inquiry.buyerId !== me) throw new NotFoundError("Inquiry not found");

    const review = canWithdrawInquiry(inquiry.status as LandListingInquiryStatus);
    if (!review.canWithdraw) throw new ValidationError({ code: "cannot-withdraw", blocker: review.blocker });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.landListingInquiry.update({
        where: { id: inquiryId },
        data: { status: "withdrawn" },
      });

      await this.audit.append(tx, {
        entityType: "land-listing-inquiry",
        entityId: inquiryId,
        action: "status-change",
        actorId: me,
        payload: { to: "withdrawn" },
      });

      return updated;
    });
  }
}
