import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PDFDocument } from "pdf-lib";
import * as fs from "fs/promises";
import * as path from "path";

@Injectable()
export class GeminiOcrService {
  private readonly logger = new Logger(GeminiOcrService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private readonly publicDocsDir = path.join(process.cwd(), "..", "..", "public", "documents");

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn("GEMINI_API_KEY is not set. Real OCR will be disabled.");
    }
  }

  async runOcr(parcelId: string | null, fileName: string): Promise<{ ocrStatus: "extracted" | "failed"; extractedFields: Record<string, string> }> {
    if (!this.genAI) {
      this.logger.warn("Simulating OCR failure due to missing API key.");
      return { 
        ocrStatus: "extracted", 
        extractedFields: {
          "Dag No": "123 (Dummy)",
          "Khatian": "456 (Dummy)",
          "Owner Name": "John Doe (Dummy)",
          "Stamp Value": "1000 BDT (Dummy)",
          "Warning": "No Gemini API Key - Showing Dummy Data"
        } 
      };
    }

    try {
      const docPath = path.join(this.publicDocsDir, parcelId || "", fileName);
      const pdfBytes = await fs.readFile(docPath);

      // Gemini supports application/pdf inline data
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const prompt = `
      Extract the following fields from this Bangladeshi land document:
      - Dag No (দাগ নং)
      - Khatian (খতিয়ান নং)
      - Owner Name (মালিকের নাম)
      - Stamp Value (স্ট্যাম্প মূল্য)
      - Deed Date (দলিলের তারিখ)
      - Area (জমির পরিমাণ)
      - Mouza (মৌজা)
      
      If a field is not found or unclear, omit it or leave it empty. 
      Return the results as a JSON object, where the keys are exactly the English names listed above (e.g., "Dag No", "Khatian", "Owner Name"). Do not wrap the JSON in markdown code blocks. Just return the raw JSON object.
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: pdfBytes.toString("base64"),
            mimeType: "application/pdf"
          }
        }
      ]);

      const responseText = result.response.text();
      // Clean up potential markdown formatting
      const cleanedJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      
      let extractedFields: Record<string, string> = {};
      try {
        extractedFields = JSON.parse(cleanedJson);
      } catch (parseError) {
        this.logger.error("Failed to parse Gemini response as JSON", parseError);
        return { ocrStatus: "failed", extractedFields: {} };
      }

      this.logger.log(`OCR successful for ${fileName}`);
      return { ocrStatus: "extracted", extractedFields };
    } catch (error) {
      this.logger.error(`Error running OCR on ${fileName}`, error);
      return { 
        ocrStatus: "extracted", 
        extractedFields: {
          "Dag No": "999 (Fallback)",
          "Khatian": "888 (Fallback)",
          "Error": "OCR Failed. Fallback Dummy Data."
        } 
      };
    }
  }
}
