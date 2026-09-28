import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InheritanceController } from "./inheritance.controller";

@Module({ imports: [AuthModule], controllers: [InheritanceController] })
export class InheritanceModule {}
