import { Module } from "@nestjs/common";
import { FieldReportsController } from "./field-reports.controller";

@Module({ controllers: [FieldReportsController] })
export class FieldReportsModule {}
