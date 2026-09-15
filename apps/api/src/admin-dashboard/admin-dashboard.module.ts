import { Module } from "@nestjs/common";
import { AdminDashboardController } from "./admin-dashboard.controller";

@Module({ controllers: [AdminDashboardController] })
export class AdminDashboardModule {}
