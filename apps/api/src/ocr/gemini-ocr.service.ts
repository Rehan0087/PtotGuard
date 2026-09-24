import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const MODEL_NAME = process.env.GEMINI_OCR_MODEL?.trim() || "gemini-3.6-flash";

export interface OcrRequest {
  parcelId: string | null;
  fileName: string;
  mimeType: string;
  documentType: string;
  registered?: { dagNo: string; khatianNo: string };
}

export interface OcrResult {
  ocrStatus: "extracted" | "failed";
  extractedFields: Record<string, string>;
  fraudScore: number | null;
  findings: string[];
  model: string | null;
}

const FIELD_ALIASES: Record<string, string> = {
  "owner name": "Owner",
  owner: "Owner",
  "dag no": "Dag No",
  "dag number": "Dag No",
  khatian: "Khatian",
  "khatian no": "Khatian",
  "khatian number": "Khatian",
  "stamp value": "Stamp Value",
  "deed date": "Deed Date",
  area: "Area",
  mouza: "Mouza",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Parse and constrain model output before it is allowed near the database. */
export function parseOcrResult(raw: string, model = MODEL_NAME): OcrResult {
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = record(JSON.parse(json));
  if (!parsed) throw new Error("OCR response must be a JSON object");

  const sourceFields = record(parsed.extractedFields) ?? {};
  const extractedFields: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(sourceFields)) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const value = String(rawValue).trim();
    if (!value) continue;
    const key = FIELD_ALIASES[rawKey.trim().toLowerCase()] ?? rawKey.trim();
    if (key) extractedFields[key] = value;
  }

  const assessment = record(parsed.fraudAssessment) ?? {};
  const numericScore = Number(assessment.score);
  const fraudScore = Number.isFinite(numericScore)
    ? Math.max(0, Math.min(1, numericScore))
    : 0;
  const findings = Array.isArray(assessment.findings)
    ? assessment.findings
        .filter((finding): finding is string => typeof finding === "string")
        .map((finding) => finding.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    ocrStatus: "extracted",
    extractedFields,
    fraudScore,
    findings,
    model,
  };
}

@Injectable()
export class GeminiOcrService {
  private readonly logger = new Logger(GeminiOcrService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly publicDocsDir = path.resolve(process.cwd(), "..", "..", "public", "documents");

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    this.genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!apiKey) this.logger.warn("GEMINI_API_KEY is not set. OCR requests will fail closed.");
  }

  async runOcr(request: OcrRequest): Promise<OcrResult> {
    if (!this.genAI) return this.failed("OCR model is not configured");

    try {
      const directory = request.parcelId ?? "general";
      const docPath = path.resolve(this.publicDocsDir, directory, path.basename(request.fileName));
      const expectedRoot = `${this.publicDocsDir}${path.sep}`;
      if (!docPath.startsWith(expectedRoot)) throw new Error("Document path is outside storage");
      const bytes = await fs.readFile(docPath);

      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      });
      const registered = request.registered
        ? `Registered land record for comparison: Dag No=${request.registered.dagNo}; Khatian=${request.registered.khatianNo}.`
        : "No registered parcel values are available for comparison.";
      const prompt = `You are an OCR and anomaly-screening assistant for Bangladeshi land records.
Read this ${request.documentType} in Bangla or English. Extract only values visible in the document.
${registered}

Return exactly one JSON object with this shape:
{
  "extractedFields": {
    "Dag No": "",
    "Khatian": "",
    "Owner": "",
    "Stamp Value": "",
    "Deed Date": "",
    "Area": "",
    "Mouza": ""
  },
  "fraudAssessment": {
    "score": 0.0,
    "findings": []
  }
}

Omit unreadable or absent extracted fields. A finding must describe specific visible evidence such as
an overwritten identifier, inconsistent pages, an apparent alteration, a duplicate/mismatched seal or
signature, or a Dag/Khatian conflict with the registered record. Do not call a document fraudulent and
do not invent evidence. The score is screening risk from 0 to 1, not a legal decision. Human verification
is mandatory regardless of the score.`;

      const result = await model.generateContent([
        prompt,
        { inlineData: { data: bytes.toString("base64"), mimeType: request.mimeType } },
      ]);
      const parsed = parseOcrResult(result.response.text());
      this.logger.log(`OCR completed for ${request.fileName}`);
      return parsed;
    } catch (error) {
      this.logger.error(`OCR failed for ${request.fileName}`, error);
      return this.failed(error instanceof Error ? error.message : "Unknown OCR error");
    }
  }

  private failed(reason: string): OcrResult {
    this.logger.warn(reason);
    return {
      ocrStatus: "failed",
      extractedFields: {},
      fraudScore: null,
      findings: [],
      model: null,
    };
  }
}
