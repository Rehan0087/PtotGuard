import { Module } from "@nestjs/common";
import { CommunityController } from "./community.controller";

@Module({ controllers: [CommunityController] })
export class CommunityModule {}

