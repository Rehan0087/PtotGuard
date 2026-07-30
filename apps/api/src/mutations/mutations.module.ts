import { Module } from "@nestjs/common";
import { MutationsController } from "./mutations.controller";

@Module({ controllers: [MutationsController] })
export class MutationsModule {}
