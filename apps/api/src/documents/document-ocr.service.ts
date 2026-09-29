import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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

    const parcel = doc.parcelId
      ? await this.prisma.parcel.findUnique({ where: { id: doc.parcelId } })
      : null;
    const result = await this.ocrService.runOcr({
      parcelId: doc.parcelId ?? parcelId ?? null,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      documentType: doc.type,
      registered: parcel ? { dagNo: parcel.dagNo, khatianNo: parcel.khatianNo } : undefined,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.landDocument.update({
        where: { id: documentId },
        data: {
          ocrStatus: result.ocrStatus,
          extractedFields: result.extractedFields,
          fraudScore: result.fraudScore,
          ocrFindings: result.findings,
          ocrModel: result.model,
          // Extraction and risk signals are evidence only. They never make a
          // workflow decision; an officer must accept or escalate the deed.
          verificationStatus: "unverified",
        },
      });
      await tx.appNotification.create({
        data: {
          id: `n-${randomUUID()}`,
          userId: doc.ownerId ?? doc.uploadedById,
          at: new Date(),
          severity: result.ocrStatus === "failed" ? "critical" : "success",
          title: result.ocrStatus === "failed" ? "Document OCR failed" : "Document processed",
          body: result.ocrStatus === "failed"
            ? `${doc.fileName} could not be read and remains blocked.`
            : `Text was extracted from ${doc.fileName}. It is now awaiting officer verification.`,
          content: { code: "document-processed", fileName: doc.fileName },
          read: false,
          href: "/documents",
        },
      });
    });
  }
}
