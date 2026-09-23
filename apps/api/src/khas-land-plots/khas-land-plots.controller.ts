import { Controller, Get, Param, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundError } from "../common/domain-exceptions";

@Controller("khas-land-plots")
export class KhasLandPlotsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(@Query("landUse") landUse?: string, @Query("status") status?: string) {
    const where: any = {};
    if (landUse) where.landUse = landUse;
    if (status) where.status = status;
    else where.status = "available"; // default to available plots

    const items = await this.prisma.khasLandPlot.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    
    return {
      items,
      total: items.length,
      page: 1,
      pageSize: Math.max(1, items.length),
    };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const plot = await this.prisma.khasLandPlot.findUnique({
      where: { id },
    });
    if (!plot) throw new NotFoundError("Khas land plot not found");
    return plot;
  }
}
