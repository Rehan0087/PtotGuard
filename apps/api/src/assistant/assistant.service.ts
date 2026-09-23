import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { Content, FunctionDeclaration, Part } from "@google/generative-ai";
import { PrismaService } from "../prisma/prisma.service";
import { TooManyRequestsError } from "../common/domain-exceptions";

const MODEL_NAME = "gemini-2.0-flash";
const RATE_LIMIT_MAX_MESSAGES = 15;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_TOOL_ROUND_TRIPS = 4;

const NOT_CONFIGURED_REPLY: Record<"en" | "bn", string> = {
  en: "The assistant isn't configured yet — ask an administrator to add a Gemini API key.",
  bn: "সহকারী এখনো চালু করা হয়নি — একজন প্রশাসককে Gemini API কী যোগ করতে বলুন।",
};

const GENERIC_ERROR_REPLY: Record<"en" | "bn", string> = {
  en: "Something went wrong answering that. Please try again in a moment.",
  bn: "উত্তর দিতে একটি সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
};

/**
 * Every route the assistant may point a citizen to. suggest_action calls
 * naming anything outside this list are dropped — the model chooses when to
 * link, never where the link can go.
 */
const ASSISTANT_ACTION_ROUTES = [
  "/portal",
  "/parcels",
  "/documents",
  "/search",
  "/inheritance",
  "/mutations/new",
  "/land-tax",
  "/land-admin",
  "/revenue-cases",
  "/lease-settlement",
  "/acquisition",
  "/disputes/new",
  "/disputes",
  "/grievances/new",
  "/grievances",
  "/appointments",
  "/notifications",
];

/** Written into every system instruction — kept short, the model may elaborate. */
const SERVICE_CATALOG = `
- Mutation (e-Namjari) at /mutations/new — transfer a record after sale, inheritance, gift, or partition.
- Land Development Tax at /land-tax — pay the yearly holding tax and arrears.
- Land Administration at /land-admin — request a certified copy or correct a clerical error on a record.
- Revenue Cases at /revenue-cases — file a miscellaneous case or an appeal before AC Land / ADC Revenue.
- Lease & Settlement at /lease-settlement — apply to lease khas (government) land.
- Acquisition & Requisition at /acquisition — track a notice on your land and claim compensation.
- Dispute filing at /disputes/new — file a boundary, ownership, inheritance, encroachment, fraud, or easement dispute; track any case at /disputes.
- Grievances at /grievances/new — complain about service quality itself, separate from a dispute over land.
- Inheritance Calculator at /inheritance — estimate a Faraiz or Hindu succession split.
- Record Search at /search, and each citizen's own holdings at /parcels.
- Document Vault at /documents.
- Appointment Booking at /appointments.
`.trim();

interface ChatMessage {
  role: string;
  content: string;
}

interface SuggestedAction {
  href: string;
  label: string;
}

interface AssistantReply {
  reply: string;
  toolCalls: string[];
  suggestedActions: SuggestedAction[];
}

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_my_parcels",
    description: "List the land parcels the citizen owns.",
  },
  {
    name: "list_my_mutations",
    description: "List the citizen's mutation (e-Namjari) filings, as filer, transferor, or recipient.",
  },
  {
    name: "list_my_service_applications",
    description:
      "List the citizen's service applications: land-tax, land-admin, revenue-case, lease-settlement, acquisition, or info-bank-request.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        serviceType: {
          type: SchemaType.STRING,
          description:
            "Optional filter: one of land-tax, land-admin, revenue-case, lease-settlement, acquisition, info-bank-request.",
        },
      },
    },
  },
  {
    name: "list_my_disputes",
    description: "List disputes the citizen has filed.",
  },
  {
    name: "list_my_notifications",
    description: "List the citizen's recent notifications.",
  },
  {
    name: "suggest_action",
    description: "Offer the citizen a clickable link to a specific in-app page relevant to their question.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        href: { type: SchemaType.STRING, description: "The app route to link to, e.g. /land-tax." },
        label: { type: SchemaType.STRING, description: "Short button label, e.g. 'Pay land tax'." },
      },
      required: ["href", "label"],
    },
  },
];

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private genAI: GoogleGenerativeAI | null = null;
  private readonly rateLimits = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn("GEMINI_API_KEY is not set. The assistant will only return a fallback reply.");
    }
  }

  /** Sliding window per citizen — single-instance only, same as this codebase's other simulated infra. */
  checkRateLimit(userId: string): void {
    const now = Date.now();
    const timestamps = (this.rateLimits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (timestamps.length >= RATE_LIMIT_MAX_MESSAGES) {
      throw new TooManyRequestsError("Too many messages — please wait a few minutes and try again.");
    }
    timestamps.push(now);
    this.rateLimits.set(userId, timestamps);
  }

  async reply(
    userId: string,
    locale: "en" | "bn",
    history: ChatMessage[],
    message: string,
  ): Promise<AssistantReply> {
    if (!this.genAI) {
      return { reply: NOT_CONFIGURED_REPLY[locale], toolCalls: [], suggestedActions: [] };
    }

    try {
      const policy = await this.prisma.policy.findUnique({ where: { id: "singleton" } });
      const systemInstruction = this.buildSystemInstruction(locale, policy);

      const model = this.genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      });

      const chatHistory: Content[] = history.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history: chatHistory });
      let result = await chat.sendMessage(message);

      const toolCalls: string[] = [];
      const suggestedActions: SuggestedAction[] = [];

      for (let round = 0; round < MAX_TOOL_ROUND_TRIPS; round++) {
        const calls = result.response.functionCalls();
        if (!calls || calls.length === 0) break;

        const responseParts: Part[] = [];
        for (const call of calls) {
          toolCalls.push(call.name);
          if (call.name === "suggest_action") {
            const args = call.args as { href?: string; label?: string };
            if (args.href && args.label && ASSISTANT_ACTION_ROUTES.includes(args.href)) {
              suggestedActions.push({ href: args.href, label: args.label });
            }
            responseParts.push({ functionResponse: { name: call.name, response: { ok: true } } });
            continue;
          }

          const data = await this.runTool(userId, call.name, call.args as Record<string, unknown>);
          responseParts.push({ functionResponse: { name: call.name, response: { data } } });
        }

        result = await chat.sendMessage(responseParts);
      }

      return { reply: result.response.text(), toolCalls, suggestedActions };
    } catch (error) {
      this.logger.error("Assistant reply failed", error);
      return { reply: GENERIC_ERROR_REPLY[locale], toolCalls: [], suggestedActions: [] };
    }
  }

  private buildSystemInstruction(
    locale: "en" | "bn",
    policy: { [key: string]: unknown } | null,
  ): string {
    const fees = policy
      ? `Current fees (BDT): mutation ${policy.mutationFeeBdt}, land-admin certified copy ${policy.landAdminCertifiedCopyFeeBdt}, land-admin correction ${policy.landAdminCorrectionFeeBdt}, revenue case filing ${policy.revenueCaseFilingFeeBdt}, lease-settlement application ${policy.leaseSettlementApplicationFeeBdt}, lease-settlement agricultural ${policy.leaseSettlementAgriculturalFeeBdt}, lease-settlement non-agricultural ${policy.leaseSettlementNonAgriculturalFeeBdt}. Land tax varies by land use and holding size — use list_my_service_applications or explain that it is assessed at /land-tax.`
      : "Fee figures are unavailable right now — direct the citizen to the relevant page to see the current fee.";

    return `You are PlotGuard's assistant, helping a citizen use this Bangladeshi land-records portal.
Reply in ${locale === "bn" ? "Bangla" : "English"}, in plain, concise, friendly language.
Only discuss PlotGuard and Bangladeshi land administration. Never invent data — use the tools for anything about this citizen's own records, and say so plainly if a tool returns nothing.
Never claim to see another citizen's records; you can only see the current citizen's own data.
You cannot file, pay, or submit anything on the citizen's behalf — only explain and, when useful, call suggest_action to link to the right page.

Services available:
${SERVICE_CATALOG}

${fees}`;
  }

  private async runTool(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "list_my_parcels":
        return this.prisma.parcel.findMany({
          where: { ownerId: userId },
          select: { id: true, ulpin: true, dagNo: true, khatianNo: true, title: true, landUse: true, registryStatus: true },
        });

      case "list_my_mutations":
        return this.prisma.mutation.findMany({
          where: { OR: [{ requestedById: userId }, { fromOwnerId: userId }, { toOwnerId: userId }] },
          select: { mutationNumber: true, parcelDagNo: true, type: true, status: true, requestedAt: true },
          orderBy: { requestedAt: "desc" },
          take: 20,
        });

      case "list_my_service_applications": {
        const serviceType = typeof args.serviceType === "string" ? args.serviceType : undefined;
        return this.prisma.serviceApplication.findMany({
          where: { applicantId: userId, ...(serviceType ? { serviceType } : {}) },
          select: {
            applicationNo: true,
            serviceType: true,
            status: true,
            feeAmount: true,
            paidAt: true,
            submittedAt: true,
            decidedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
      }

      case "list_my_disputes":
        return this.prisma.dispute.findMany({
          where: { filedById: userId },
          select: { caseNumber: true, type: true, status: true, hearingDate: true, filedAt: true },
          orderBy: { filedAt: "desc" },
          take: 20,
        });

      case "list_my_notifications":
        return this.prisma.appNotification.findMany({
          where: { userId },
          select: { severity: true, title: true, body: true, at: true, read: true },
          orderBy: { at: "desc" },
          take: 10,
        });

      default:
        return { error: "unknown_tool" };
    }
  }
}
