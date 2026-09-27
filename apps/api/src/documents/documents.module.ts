import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { OcrModule } from "../ocr/ocr.module";
import { DocumentOcrService } from "./document-ocr.service";

@Module({
  imports: [OcrModule],
  controllers: [DocumentsController],
  providers: [DocumentOcrService],
  exports: [DocumentOcrService],
})
export class DocumentsModule {}
