import { randomUUID } from "node:crypto";
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { extractionReview, type LandDocument, type Parcel } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundError, ValidationError } from "../common/domain-exceptions";
import { pageParams, paginate } from "../common/pagination";
import { currentUserId } from "../auth/dev-current-user";
import { DocumentDecisionDto } from "./document-decision.dto";
import { UpdateDocumentFieldsDto } from "./update-document-fields.dto";
import { UploadDocumentDto } from "./upload-document.dto";

// Stands in for the async OCR + fraud-scoring worker (BullMQ → a real model
// in production) — same simulated shape and delay as the mock's own
// scheduleOcrWorker(), so a real deployment's UI polls and resolves exactly
// like it does against the mock. `fraudScore` is a fixed placeholder, not a
// model output — see the fraud-review queue's own note on this.
const OCR_WORKER_MS = 6000;

@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scheduleOcrWorker(documentId: string, parcelId?: string, delayMs = OCR_WORKER_MS) {
    setTimeout(() => {
      void (async () => {
        const doc = await this.prisma.landDocument.findUnique({ where: { id: documentId } });
        if (!doc || (doc.ocrStatus !== "processing" && doc.ocrStatus !== "pending")) return;

        const parcel = parcelId
          ? await this.prisma.parcel.findUnique({ where: { id: parcelId } })
          : null;
        const extractedFields = {
          "Document type": doc.type.replace(/-/g, " "),
          ...(parcel ? { "Dag No": parcel.dagNo, Khatian: parcel.khatianNo } : {}),
          "Pages read": String(doc.pageCount ?? 1),
        };

        await this.prisma.$transaction(async (tx) => {
          await tx.landDocument.update({
            where: { id: documentId },
            data: { ocrStatus: "extracted", fraudScore: 0.04, extractedFields },
          });

          const ownerId = doc.ownerId ?? doc.uploadedById;
          await tx.appNotification.create({
            data: {
              id: `n-${randomUUID()}`,
              userId: ownerId,
              at: new Date(),
              severity: "success",
              title: "Document processed",
              body: `Text was extracted from ${doc.fileName}. It is now awaiting officer verification.`,
              content: { code: "document-processed", fileName: doc.fileName },
              read: false,
              href: "/documents",
            },
          });
        });
      })();
    }, delayMs);
  }

  @Get()
  async list(@Query() query: Record<string, string>, @Req() req: Request) {
    const owner = query.owner === "me" ? currentUserId(req) : query.owner;
    const where = {
      ...(owner ? { ownerId: owner } : {}),
      // fraud=true means "awaiting fraud review": still flagged, not yet decided.
      ...(query.fraud === "true" ? { verificationStatus: "flagged" } : {}),
      ...(query.ocr ? { ocrStatus: query.ocr } : {}),
    };
    const all = await this.prisma.landDocument.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
    });
    return paginate(all, pageParams(query));
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const doc = await this.prisma.landDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Document not found");
    return doc;
  }

  /**
   * Citizen upload — additive to the frozen spec, this controller's first
   * write of any kind. No real object storage in this phase: the client
   * sends the file's own metadata, not its bytes, same stub as field-report
   * photos. Ownership-checked when a parcel is named, matching the upload
   * dialog's own picker (`useParcels({ owner: "me" })`).
   */
  @Post()
  @HttpCode(201)
  async create(@Body() body: UploadDocumentDto, @Req() req: Request) {
    const actorId = currentUserId(req);
    if (body.parcelId) {
      const parcel = await this.prisma.parcel.findUnique({ where: { id: body.parcelId } });
      if (!parcel || parcel.ownerId !== actorId) throw new NotFoundError("Parcel not found");
    }

    const created = await this.prisma.landDocument.create({
      data: {
        id: `d-${randomUUID()}`,
        parcelId: body.parcelId,
        ownerId: actorId,
        type: body.type,
        fileName: body.fileName,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        uploadedById: actorId,
        // Upload returns immediately; the worker above fills these in later.
        ocrStatus: "processing",
        verificationStatus: "unverified",
      },
    });

    this.scheduleOcrWorker(created.id, body.parcelId);
    return created;
  }

  /**
   * Officer decision on a document — the fix the original audit named
   * directly: this endpoint used to not exist at all in the real API, and
   * even the *mock's* version never ran extractionReview(), so a
   * hand-crafted request could verify a document with missing or
   * contradicting fields. `verify` now runs the same gate the OCR queue's
   * screen shows; `reject`/`flag` carry no such requirement — an officer
   * can always refuse or escalate a scan regardless of what it managed to
   * read.
   */
  @Patch(":id/decision")
  async decide(@Param("id") id: string, @Body() body: DocumentDecisionDto, @Req() req: Request) {
    const doc = await this.prisma.landDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Document not found");

    if (body.decision === "verify") {
      const parcel = doc.parcelId
        ? await this.prisma.parcel.findUnique({ where: { id: doc.parcelId } })
        : undefined;
      const review = extractionReview(
        doc as unknown as LandDocument,
        parcel as unknown as Parcel | undefined,
      );
      if (!review.canAccept) throw new ValidationError(review.hold!, "decision");
    }

    const actorId = currentUserId(req);
    const verificationStatus =
      body.decision === "verify" ? "verified" : body.decision === "flag" ? "flagged" : "rejected";

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.landDocument.update({
        where: { id },
        data: { verificationStatus },
      });

      await this.audit.append(tx, {
        entityType: "document",
        entityId: updated.id,
        action: body.decision === "verify" ? "approve" : "reject",
        actorId,
        payload: { decision: body.decision, fileName: updated.fileName, status: verificationStatus },
      });

      // document-verified has existed on NotificationContent since the
      // notifications system was built, with no writer anywhere — the same
      // pattern as dispute-assigned, dispute-executed, and survey-scheduled
      // before it.
      if (body.decision === "verify" && updated.ownerId && updated.ownerId !== actorId) {
        const dagNo = doc.parcelId
          ? (await tx.parcel.findUnique({ where: { id: doc.parcelId } }))?.dagNo
          : undefined;
        if (dagNo) {
          await tx.appNotification.create({
            data: {
              id: `n-${randomUUID()}`,
              userId: updated.ownerId,
              at: new Date(),
              severity: "success",
              title: "Document verified",
              body: `Your ${updated.type.replace(/-/g, " ")} for dag ${dagNo} passed verification.`,
              content: { code: "document-verified", dagNo },
              read: false,
              href: "/documents",
            },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Officer corrections to what the reader pulled off the scan — additive
   * to the frozen spec, same as the mock. Ungated like the mock: keying in
   * a value is always allowed, extractionReview() is what decides whether
   * the result is enough to accept.
   */
  @Patch(":id/fields")
  async updateFields(@Param("id") id: string, @Body() body: UpdateDocumentFieldsDto) {
    const doc = await this.prisma.landDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Document not found");

    return this.prisma.landDocument.update({
      where: { id },
      data: {
        extractedFields: {
          ...(doc.extractedFields as Record<string, string> | null),
          ...body.fields,
        },
      },
    });
  }

  /** Re-queues a scan for the worker, same as a fresh upload. */
  @Post(":id/reprocess")
  async reprocess(@Param("id") id: string) {
    const doc = await this.prisma.landDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundError("Document not found");

    const updated = await this.prisma.landDocument.update({
      where: { id },
      data: { ocrStatus: "processing", verificationStatus: "unverified" },
    });

    this.scheduleOcrWorker(updated.id, updated.parcelId ?? undefined);
    return updated;
  }
}
