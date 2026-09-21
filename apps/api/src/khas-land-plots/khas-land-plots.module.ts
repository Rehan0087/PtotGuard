import { Module } from "@nestjs/common";
import { KhasLandPlotsController } from "./khas-land-plots.controller";

@Module({
  controllers: [KhasLandPlotsController],
})
export class KhasLandPlotsModule {}
