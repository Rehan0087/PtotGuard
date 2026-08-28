import { Module } from "@nestjs/common";
import { LandInfoBankController } from "./land-info-bank.controller";

@Module({ controllers: [LandInfoBankController] })
export class LandInfoBankModule {}
