import { Module } from "@nestjs/common";
import { HearingsController } from "./hearings.controller";

@Module({ controllers: [HearingsController] })
export class HearingsModule {}
