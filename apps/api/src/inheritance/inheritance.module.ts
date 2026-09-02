import { Module } from "@nestjs/common";
import { InheritanceController } from "./inheritance.controller";

@Module({ controllers: [InheritanceController] })
export class InheritanceModule {}
