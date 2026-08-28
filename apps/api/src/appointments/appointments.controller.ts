import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConflictError, NotFoundError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { BookAppointmentDto } from "./book-appointment.dto";
import { RescheduleAppointmentDto } from "./reschedule-appointment.dto";

const CLOSED_STATUSES = new Set(["approved", "rejected"]);

/**
 * A citizen requesting an in-person slot at a land office — "office" being a
 * real upazila-level jurisdiction (the AC Land / Sub-Registrar office that
 * jurisdiction already denotes for every other routed record in this
 * system), not an invented office directory. There is no real capacity or
 * calendar model anywhere in this codebase, so this doesn't pretend to
 * offer "available slots" to pick from: the citizen proposes a time, an
 * officer may counter-propose one, and the same human judgement that
 * decides every other service here confirms or declines it.
 *
 * No fee, so — like acquisition — this skips the generic .../pay step and
 * lands straight in `under-review`. Confirming/declining reuses
 * ServiceApplicationsController's generic .../decision unchanged.
 */
@Controller("appointments")
export class AppointmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post("book")
  @HttpCode(201)
  async book(@Body() body: BookAppointmentDto, @Req() req: Request) {
    const me = currentUserId(req);
    const office = await this.prisma.jurisdiction.findUnique({
      where: { id: body.officeJurisdictionId },
    });
    if (!office || office.level !== "upazila") {
      throw new NotFoundError("Office not found");
    }

    if (body.parcelId) {
      const parcel = await this.prisma.parcel.findUnique({ where: { id: body.parcelId } });
      // Same answer for missing or not yours as every other service here:
      // linking someone else's parcel to your own appointment isn't a typo
      // to correct, it's a lookup that should fail identically either way.
      if (!parcel || parcel.ownerId !== me) throw new NotFoundError("Parcel not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const count = await tx.serviceApplication.count({ where: { serviceType: "appointment" } });
      const applicationNo = `APT-2026-${String(1000 + count).padStart(6, "0")}`;
      const now = new Date();

      const created = await tx.serviceApplication.create({
        data: {
          id: `sa-${randomUUID()}`,
          applicationNo,
          serviceType: "appointment",
          status: "under-review",
          parcelId: body.parcelId ?? null,
          applicantId: me,
          details: {
            officeJurisdictionId: body.officeJurisdictionId,
            purpose: body.purpose,
            preferredAt: body.preferredAt,
          } as never,
          documentIds: [],
          submittedAt: now,
        },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: created.id,
        action: "create",
        actorId: me,
        payload: {
          applicationNo: created.applicationNo,
          serviceType: "appointment",
          officeJurisdictionId: body.officeJurisdictionId,
        },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: created.id,
          at: now,
          type: "submitted",
          title: "Appointment requested",
          actorId: me,
        },
      });

      return created;
    });
  }

  /** An officer's counter-proposal — doesn't itself confirm or decline, just
   * updates the time on offer. Callable again while still under review, the
   * same "correct the date without a separate endpoint" shape as revenue
   * cases' own schedule-hearing(). */
  @Patch(":id/reschedule")
  async reschedule(
    @Param("id") id: string,
    @Body() body: RescheduleAppointmentDto,
    @Req() req: Request,
  ) {
    const application = await this.prisma.serviceApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundError("Service application not found");
    if (CLOSED_STATUSES.has(application.status)) {
      throw new ConflictError("This appointment has already been decided.");
    }

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const details = {
        ...(application.details as Record<string, unknown>),
        confirmedAt: body.confirmedAt,
      };
      const updated = await tx.serviceApplication.update({
        where: { id },
        data: { details: details as never },
      });

      await this.audit.append(tx, {
        entityType: "service-application",
        entityId: updated.id,
        action: "status-change",
        actorId,
        payload: { applicationNo: updated.applicationNo, confirmedAt: body.confirmedAt },
      });

      await tx.serviceApplicationEvent.create({
        data: {
          id: `sae-${randomUUID()}`,
          applicationId: updated.id,
          at: now,
          type: "status-change",
          title: "Appointment time proposed",
          actorId,
        },
      });

      return updated;
    });
  }
}
