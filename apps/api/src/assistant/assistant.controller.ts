import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { currentUserId } from "../auth/dev-current-user";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { randomUUID } from "crypto";
import { SendAssistantMessageDto } from "./send-assistant-message.dto";
import { AssistantService } from "./assistant.service";

/**
 * Every route here is citizen-only, so the guard sits on the class rather
 * than per-method — there is no read on this controller other roles should
 * reach, unlike UsersController/HearingsController where reads stay open.
 */
@Controller("assistant")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("citizen")
export class AssistantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistant: AssistantService,
  ) {}

  private async findOrCreateConversation(userId: string) {
    const existing = await this.prisma.assistantConversation.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.assistantConversation.create({
      data: { id: randomUUID(), userId },
    });
  }

  @Get("conversation")
  async getConversation(@Req() req: Request) {
    const conversation = await this.findOrCreateConversation(currentUserId(req));
    const messages = await this.prisma.assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    return { id: conversation.id, messages };
  }

  @Post("message")
  async sendMessage(@Body() body: SendAssistantMessageDto, @Req() req: Request) {
    const userId = currentUserId(req);
    this.assistant.checkRateLimit(userId);

    const conversation = await this.findOrCreateConversation(userId);
    const history = await this.prisma.assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });

    await this.prisma.assistantMessage.create({
      data: { id: randomUUID(), conversationId: conversation.id, role: "user", content: body.message },
    });

    const { reply, toolCalls, suggestedActions } = await this.assistant.reply(
      userId,
      body.locale,
      history.map((m) => ({ role: m.role, content: m.content })),
      body.message,
    );

    const message = await this.prisma.assistantMessage.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        role: "model",
        content: reply,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      },
    });

    return { message, suggestedActions };
  }

  @Post("reset")
  @HttpCode(200)
  async reset(@Req() req: Request) {
    const conversation = await this.findOrCreateConversation(currentUserId(req));
    await this.prisma.assistantMessage.deleteMany({ where: { conversationId: conversation.id } });
    return { ok: true };
  }
}
