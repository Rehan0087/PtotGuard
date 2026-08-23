import { Module } from "@nestjs/common";
import { RevenueCasesController } from "./revenue-cases.controller";

@Module({ controllers: [RevenueCasesController] })
export class RevenueCasesModule {}
