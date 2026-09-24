import { Module } from "@nestjs/common";
import { LandListingsController } from "./land-listings.controller";

@Module({ controllers: [LandListingsController] })
export class LandListingsModule {}
