import { Module } from "@nestjs/common";
import { ServiceApplicationsController } from "./service-applications.controller";

@Module({ controllers: [ServiceApplicationsController] })
export class ServiceApplicationsModule {}
