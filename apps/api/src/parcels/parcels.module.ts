import { Module } from "@nestjs/common";
import { ParcelsController } from "./parcels.controller";

@Module({ controllers: [ParcelsController] })
export class ParcelsModule {}
