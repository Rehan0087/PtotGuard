import { Module } from "@nestjs/common";
import { LandAdminController } from "./land-admin.controller";

@Module({ controllers: [LandAdminController] })
export class LandAdminModule {}
