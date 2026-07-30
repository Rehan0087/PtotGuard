import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Whole flat list, unpaginated — the frontend builds the tree client-side (buildTree()). */
@Controller("jurisdictions")
export class JurisdictionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.jurisdiction.findMany();
  }
}
