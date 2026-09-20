import { Module } from "@nestjs/common";
import { GrievancesController } from "./grievances.controller";

@Module({
  controllers: [GrievancesController],
})
export class GrievancesModule {}
