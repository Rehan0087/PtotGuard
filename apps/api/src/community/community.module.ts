import { Module } from "@nestjs/common";
import { CommunityController } from "./community.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [CommunityController],
})
export class CommunityModule {}
