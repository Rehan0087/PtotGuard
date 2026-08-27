import { Module } from "@nestjs/common";
import { AcquisitionController } from "./acquisition.controller";

@Module({ controllers: [AcquisitionController] })
export class AcquisitionModule {}
