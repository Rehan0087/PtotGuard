import { Module } from "@nestjs/common";
import { LeaseSettlementController } from "./lease-settlement.controller";

@Module({ controllers: [LeaseSettlementController] })
export class LeaseSettlementModule {}
