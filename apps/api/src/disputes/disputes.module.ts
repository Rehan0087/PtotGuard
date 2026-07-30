import { Module } from "@nestjs/common";
import { DisputesController } from "./disputes.controller";

@Module({ controllers: [DisputesController] })
export class DisputesModule {}
