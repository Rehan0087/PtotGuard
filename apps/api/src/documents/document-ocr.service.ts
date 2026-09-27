import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { extractionReview, type LandDocument, type Parcel } from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { GeminiOcrService } from "../ocr/gemini-ocr.service";

/** Runs OCR only after a document has entered the mutation workflow. */
@Injectable()
export class DocumentOcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: GeminiOcrService,
  ) {}

  schedule(documentId: string, parcelId?: string, delayMs = 1000) {
    setTimeout(() => void this.process(documentId, parcelId), delayMs);
  }

  private async process(documentId: string, parcelId?: string) {
    const doc = await this.prisma.landDocument.findUnique({ where: { id: documentId } });
    if (!doc || (doc.ocrStatus !== "processing" && doc.ocrStatus !== "pending")) return;

    const [parcel, policy] = await Promise.all([
      doc.parcelId ? this.prisma.parcel.findUnique({ where: { id: doc.parcelId } }) : null,
      this.prisma.policy.findUnique({ where: { id: "singleton" } }),
    ]);
    const result = await this.ocrService.runOcr({
      parcelId: doc.parcelId ?? parcelId ?? null,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      documentType: doc.type,
      registered: parcel ? { dagNo: parcel.dagNo, khatianNo: parcel.khatianNo } : undefined,
    });
    const registerReview = result.ocrStatus === "extracted"
      ? extractionReview(
          { ...doc, ocrStatus: result.ocrStatus, extractedFields: result.extractedFields } as unknown as LandDocument,
          parcel as unknown as Parcel | undefined,
        )
      : null;
    const findings = [
      ...result.findings,
      ...(registerReview?.issues
        .filter((issue) => issue.kind === "mismatch")
        .map((issue) => `${issue.field} does not match the registered record (${issue.scanned} vs ${issue.registered}).`) ?? []),
    ];
    const shouldFlag = result.ocrStatus === "extracted" && (
      findings.length > 0 || registerReview?.mustEscalate === true ||
      (result.fraudScore ?? 0) >= (policy?.fraudScoreThreshold ?? 1)
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.landDocument.update({
        where: { id: documentId },
        data: {
          ocrStatus: result.ocrStatus,
          extractedFields: result.extractedFields,
          fraudScore: result.fraudScore,
          ocrFindings: findings,
          ocrModel: result.model,
          verificationStatus: shouldFlag ? "flagged" : "unverified",
        },
      });
      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: doc.ownerId ?? doc.uploadedById,
          at: new Date(),
          severity: result.ocrStatus === "failed" ? "critical" : shouldFlag ? "warning" : "success",
          title: result.ocrStatus === "failed" ? "Document OCR failed" : shouldFlag ? "Document needs review" : "Document processed",
          body: result.ocrStatus === "failed"
            ? `${doc.fileName} could not be read and remains blocked.`
            : shouldFlag
              ? `${doc.fileName} was routed to fraud review for an officer decision.`
              : `Text was extracted from ${doc.fileName}. It is now awaiting officer verification.`,
          content: { code: "document-processed", fileName: doc.fileName },
          read: false,
          href: "/documents",
        },
      });
    });
  }
}
