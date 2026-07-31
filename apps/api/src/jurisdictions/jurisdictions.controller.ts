import { randomUUID } from "node:crypto";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  deletionGate,
  reviewDraft,
  type DraftReview,
  type Jurisdiction,
  type JurisdictionDraft,
  type JurisdictionField,
  type Parcel,
  type User,
} from "@plotguard/rules";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { changedFields } from "../audit/changed-fields";
import { ConflictError, NotFoundError, ValidationError } from "../common/domain-exceptions";
import { currentUserId } from "../auth/dev-current-user";
import { JurisdictionDraftDto } from "./jurisdiction-draft.dto";

/**
 * The order reviewDraft() (packages/rules/src/jurisdictions.ts) itself checks
 * fields in, and therefore assigns them to `errors` in — name, then code,
 * then the rung above, then the rung below. Mirrors the mock's
 * `unprocessable()`, which picks whichever field an object's own key order
 * put first; this is the same answer, made explicit rather than relying on
 * one more file agreeing that insertion order is meaningful here.
 */
const FIELD_ORDER: JurisdictionField[] = ["name", "code", "parentId", "level"];

function firstError(errors: DraftReview["errors"]): ValidationError | null {
  for (const field of FIELD_ORDER) {
    const error = errors[field];
    if (error) return new ValidationError(error, field);
  }
  return null;
}

@Controller("jurisdictions")
export class JurisdictionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Whole flat list, unpaginated — the frontend builds the tree client-side (buildTree()). */
  @Get()
  list() {
    return this.prisma.jurisdiction.findMany();
  }

  /**
   * Additive to the frozen spec, which froze only the GET — the admin screen
   * needs to edit the tree. Runs the same rule the client shows
   * (reviewDraft()), so a hand-rolled request can't create a mouza with no
   * parent or a code another node already holds.
   */
  @Post()
  @HttpCode(201)
  async create(@Body() body: JurisdictionDraftDto, @Req() req: Request) {
    const all = await this.prisma.jurisdiction.findMany();

    const draft: JurisdictionDraft = {
      name: (body.name ?? "").trim(),
      nameBn: body.nameBn?.trim() || undefined,
      code: (body.code ?? "").trim().toUpperCase(),
      level: body.level ?? "mouza",
      parentId: body.parentId ?? null,
    };
    const review = reviewDraft(draft, all as unknown as Jurisdiction[]);
    const error = firstError(review.errors);
    if (error) throw error;

    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.jurisdiction.create({
        data: { id: `j-${randomUUID()}`, ...draft },
      });
      await this.audit.append(tx, {
        entityType: "jurisdiction",
        entityId: created.id,
        action: "create",
        actorId,
        payload: { name: created.name, code: created.code, level: created.level },
      });
      return created;
    });
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: JurisdictionDraftDto,
    @Req() req: Request,
  ) {
    const [target, all] = await Promise.all([
      this.prisma.jurisdiction.findUnique({ where: { id } }),
      this.prisma.jurisdiction.findMany(),
    ]);
    if (!target) throw new NotFoundError("Jurisdiction not found");

    const draft: JurisdictionDraft = {
      id: target.id,
      name: (body.name ?? target.name).trim(),
      nameBn: (body.nameBn ?? target.nameBn ?? undefined)?.trim() || undefined,
      code: (body.code ?? target.code).trim().toUpperCase(),
      level: (body.level ?? target.level) as JurisdictionDraft["level"],
      // parentId is nullable, so undefined (absent from the body) and null
      // (explicitly clearing it) have to be told apart.
      parentId: body.parentId === undefined ? target.parentId : body.parentId,
    };
    const review = reviewDraft(draft, all as unknown as Jurisdiction[]);
    const error = firstError(review.errors);
    if (error) throw error;

    const before = { name: target.name, code: target.code, level: target.level };
    const actorId = currentUserId(req);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.jurisdiction.update({
        where: { id },
        data: {
          name: draft.name,
          nameBn: draft.nameBn,
          code: draft.code,
          level: draft.level,
          parentId: draft.parentId,
        },
      });
      await this.audit.append(tx, {
        entityType: "jurisdiction",
        entityId: updated.id,
        action: "update",
        actorId,
        payload: changedFields(before, {
          name: updated.name,
          code: updated.code,
          level: updated.level,
        }),
      });
      return updated;
    });
  }

  /**
   * Referential, not a rule violation — other records still point at this
   * node, so 409 (deletionGate()) rather than 422. Needs the full tree plus
   * every user and parcel: deletionGate() checks the whole subtree, not just
   * this row, the same way the client does before showing the button at all.
   */
  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string, @Req() req: Request) {
    const target = await this.prisma.jurisdiction.findUnique({ where: { id } });
    if (!target) throw new NotFoundError("Jurisdiction not found");

    const [all, users, parcels] = await Promise.all([
      this.prisma.jurisdiction.findMany(),
      this.prisma.user.findMany(),
      this.prisma.parcel.findMany(),
    ]);
    const gate = deletionGate(
      id,
      all as unknown as Jurisdiction[],
      users as unknown as User[],
      parcels as unknown as Parcel[],
    );
    if (!gate.canDelete) {
      throw new ConflictError(
        `Still in use: ${gate.blockers.map((b) => b.code).join(", ")}.`,
        gate.blockers,
      );
    }

    const actorId = currentUserId(req);

    await this.prisma.$transaction(async (tx) => {
      await tx.jurisdiction.delete({ where: { id } });
      await this.audit.append(tx, {
        entityType: "jurisdiction",
        entityId: target.id,
        action: "delete",
        actorId,
        payload: { name: target.name, code: target.code, level: target.level },
      });
    });
  }
}
