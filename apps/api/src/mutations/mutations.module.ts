import { Module } from "@nestjs/common";
import { MutationsController } from "./mutations.controller";
import { DocumentsModule } from "../documents/documents.module";

@Module({ imports: [DocumentsModule], controllers: [MutationsController] })
export class MutationsModule {}
