import { Module } from "@nestjs/common";
import { GeminiOcrService } from "./gemini-ocr.service";

@Module({
  providers: [GeminiOcrService],
  exports: [GeminiOcrService],
})
export class OcrModule {}
