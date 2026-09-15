import { Module } from "@nestjs/common";
import { LandOfficeDashboardController } from "./land-office-dashboard.controller";

@Module({ controllers: [LandOfficeDashboardController] })
export class LandOfficeDashboardModule {}
