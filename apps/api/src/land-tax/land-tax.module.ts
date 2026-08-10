import { Module } from "@nestjs/common";
import { LandTaxController } from "./land-tax.controller";

@Module({ controllers: [LandTaxController] })
export class LandTaxModule {}
