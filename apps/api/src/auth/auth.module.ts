import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AccessTokenGuard } from "./access-token.guard";
import { RolesGuard } from "./roles.guard";

@Module({
  controllers: [AuthController],
  providers: [AccessTokenGuard, RolesGuard],
  exports: [AccessTokenGuard, RolesGuard],
})
export class AuthModule {}
