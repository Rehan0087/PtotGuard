import { describe, expect, it } from "vitest";
import { parseOcrResult } from "./gemini-ocr.service";

describe("parseOcrResult", () => {
  it("normalises deed fields and keeps evidence-backed screening findings", () => {
    const result = parseOcrResult(JSON.stringify({
      extractedFields: { "Owner Name": " Ayesha Siddika ", "Dag No": "CS-142/3", Empty: "" },
      fraudAssessment: { score: 0.82, findings: ["Dag number is overwritten", "  "] },
    }), "test-model");

    expect(result).toEqual({
      ocrStatus: "extracted",
      extractedFields: { Owner: "Ayesha Siddika", "Dag No": "CS-142/3" },
      fraudScore: 0.82,
      findings: ["Dag number is overwritten"],
      model: "test-model",
    });
  });

  it("accepts fenced JSON and clamps an invalidly high risk score", () => {
    const result = parseOcrResult("```json\n{\"extractedFields\":{},\"fraudAssessment\":{\"score\":4,\"findings\":[]}}\n```");
    expect(result.fraudScore).toBe(1);
  });

  it("rejects non-object output instead of fabricating extracted data", () => {
    expect(() => parseOcrResult("[]")).toThrow("JSON object");
  });
});
