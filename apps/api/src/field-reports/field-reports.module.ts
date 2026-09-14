import { Module } from "@nestjs/common";
import { FieldReportsController } from "./field-reports.controller";
import { AuthModule } from "../auth/auth.module";

@Module({ imports: [AuthModule], controllers: [FieldReportsController] })
export class FieldReportsModule {}
