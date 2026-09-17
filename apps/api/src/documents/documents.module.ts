import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { OcrModule } from "../ocr/ocr.module";

@Module({
  imports: [OcrModule],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
