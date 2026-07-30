import { Module } from "@nestjs/common";
import { JurisdictionsController } from "./jurisdictions.controller";

@Module({ controllers: [JurisdictionsController] })
export class JurisdictionsModule {}
