import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { Content, FunctionDeclaration, Part } from "@google/generative-ai";
import { PrismaService } from "../prisma/prisma.service";
import { TooManyRequestsError } from "../common/domain-exceptions";

const MODEL_NAME = "gemini-2.0-flash";
const RATE_LIMIT_MAX_MESSAGES = 15;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_TOOL_ROUND_TRIPS = 4;

const GENERIC_ERROR_REPLY: Record<"en" | "bn", string> = {
  en: "Something went wrong answering that. Please try again in a moment.",
  bn: "উত্তর দিতে একটি সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
};

// ---------------------------------------------------------------------------
// Keyword-based rule engine — used when GEMINI_API_KEY is not configured.
// Each rule has a set of keywords (matched case-insensitively against the
// user message) and produces a reply + optional suggested actions.
// ---------------------------------------------------------------------------

interface RuleEngineRule {
  keywords: string[];
  en: { reply: string; actions: { href: string; label: string }[] };
  bn: { reply: string; actions: { href: string; label: string }[] };
}

const RULE_ENGINE_RULES: RuleEngineRule[] = [
  // ── Land Tax / খাজনা ───────────────────────────────────────────────────
  {
    keywords: [
      "land tax", "pay tax", "land development tax", "khajna", "khajana",
      "tax payment", "tax pay", "ভূমি কর", "খাজনা", "কর দিতে", "কর পরিশোধ", "ভূমি উন্নয়ন কর", "ট্যাক্স"
    ],
    en: {
      reply:
        "Here's how to pay your **Land Development Tax** step by step:\n\n" +
        "1️⃣ Go to **Land Tax** from the sidebar (or tap the button below).\n" +
        "2️⃣ You'll see your holdings with the amount due. Select the one you want to pay.\n" +
        "3️⃣ Click **Pay Now** next to the holding.\n" +
        "4️⃣ A payment dialog will open. Choose your payment method:\n" +
        "   • **bKash / Nagad** — enter your mobile number, click Continue, then enter your PIN and confirm.\n" +
        "   • **Card** — enter card number, expiry (MM/YY), CVV, then your PIN.\n" +
        "5️⃣ Click **Pay [Amount]**. A receipt is shown instantly.\n\n" +
        "💡 For your security, card details are never stored.",
      actions: [{ href: "/land-tax", label: "Pay land tax" }],
    },
    bn: {
      reply:
        "**ভূমি উন্নয়ন কর** পরিশোধের ধাপগুলো:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **ভূমি উন্নয়ন কর** নির্বাচন করুন (অথবা নিচের বোতামে ক্লিক করুন)।\n" +
        "2️⃣ আপনার হোল্ডিং ও বকেয়ার তালিকা দেখতে পাবেন। যেটি পরিশোধ করতে চান সেটি বেছে নিন।\n" +
        "3️⃣ **এখনই পরিশোধ করুন** বোতামে ক্লিক করুন।\n" +
        "4️⃣ পেমেন্ট পদ্ধতি বেছে নিন:\n" +
        "   • **বিকাশ / নগদ** — মোবাইল নম্বর দিন, এগিয়ে যান, তারপর পিন দিন।\n" +
        "   • **কার্ড** — কার্ড নম্বর, মেয়াদ (MM/YY), সিভিভি, তারপর পিন দিন।\n" +
        "5️⃣ **পরিশোধ করুন** বোতামে ক্লিক করুন। রসিদ সাথে সাথে দেখাবে।\n\n" +
        "💡 নিরাপত্তার স্বার্থে কার্ডের তথ্য কখনো সংরক্ষণ করা হয় না।",
      actions: [{ href: "/land-tax", label: "ভূমি কর দিন" }],
    },
  },

  // ── Mutation / Namjari ────────────────────────────────────────────────────
  {
    keywords: [
      "mutation", "namjari", "e-namjari", "transfer ownership", "ownership transfer",
      "transfer land", "নামজারি", "মালিকানা হস্তান্তর", "নাম পরিবর্তন",
    ],
    en: {
      reply:
        "Here's how to file a **Mutation (e-Namjari)**:\n\n" +
        "1️⃣ Click **Mutations → New Mutation** in the sidebar.\n" +
        "2️⃣ Select your mutation type: **Sale, Inheritance, Gift, or Partition**.\n" +
        "3️⃣ Choose the parcel (Dag No.) you are transferring.\n" +
        "4️⃣ Enter the new owner's details and upload required documents (title deed, NID, sale deed, etc.).\n" +
        "5️⃣ Review the fee and pay it (bKash, Nagad, or Card).\n" +
        "6️⃣ Submit — you'll receive a mutation number and can track progress on this page.\n\n" +
        "📌 A field agent may visit to verify the boundary before approval.",
      actions: [{ href: "/mutations/new", label: "File a mutation" }],
    },
    bn: {
      reply:
        "**নামজারি** দাখিলের ধাপগুলো:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **নামজারি → নতুন নামজারি** নির্বাচন করুন।\n" +
        "2️⃣ নামজারির ধরন বেছে নিন: **বিক্রয়, উত্তরাধিকার, হেবা বা বণ্টন**।\n" +
        "3️⃣ যে দাগ হস্তান্তর হবে সেটি বেছে নিন।\n" +
        "4️⃣ নতুন মালিকের তথ্য দিন ও প্রয়োজনীয় দলিলপত্র আপলোড করুন।\n" +
        "5️⃣ ফি পর্যালোচনা করুন এবং পরিশোধ করুন।\n" +
        "6️⃣ জমা দিন — একটি নামজারি নম্বর পাবেন এবং অগ্রগতি এখানে ট্র্যাক করতে পারবেন।\n\n" +
        "📌 অনুমোদনের আগে একজন মাঠকর্মী সরেজমিন যাচাই করতে পারেন।",
      actions: [{ href: "/mutations/new", label: "নামজারি দাখিল করুন" }],
    },
  },

  // ── Dispute ───────────────────────────────────────────────────────────────
  {
    keywords: [
      "dispute", "file dispute", "boundary dispute", "ownership dispute", "encroachment",
      "fraud", "inheritance dispute", "বিরোধ", "বিরোধ দাখিল", "সীমানা", "অবৈধ দখল",
    ],
    en: {
      reply:
        "Here's how to **File a Dispute**:\n\n" +
        "1️⃣ Go to **Disputes → File a Dispute** in the sidebar.\n" +
        "2️⃣ Select the dispute type: Boundary, Ownership, Inheritance, Encroachment, Fraud, or Easement.\n" +
        "3️⃣ Select the affected parcel from your holdings.\n" +
        "4️⃣ Describe the dispute clearly in the description field.\n" +
        "5️⃣ Upload supporting evidence (photos, deeds, court orders, etc.).\n" +
        "6️⃣ Submit — the Land Office will review and a field agent may visit.\n\n" +
        "📌 Track your case status under **Disputes** at any time.",
      actions: [
        { href: "/disputes/new", label: "File a dispute" },
        { href: "/disputes", label: "My disputes" },
      ],
    },
    bn: {
      reply:
        "**বিরোধ দাখিল** করার ধাপগুলো:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **বিরোধ → বিরোধ দাখিল করুন** নির্বাচন করুন।\n" +
        "2️⃣ বিরোধের ধরন বেছে নিন: সীমানা, মালিকানা, উত্তরাধিকার, অবৈধ দখল, জালিয়াতি বা সুখাধিকার।\n" +
        "3️⃣ আক্রান্ত দাগটি বেছে নিন।\n" +
        "4️⃣ বিরোধের বিবরণ স্পষ্টভাবে লিখুন।\n" +
        "5️⃣ প্রমাণ আপলোড করুন (ছবি, দলিল, আদালতের আদেশ ইত্যাদি)।\n" +
        "6️⃣ জমা দিন — ভূমি অফিস পর্যালোচনা করবে।\n\n" +
        "📌 যেকোনো সময় **বিরোধ** মেনু থেকে আপনার মামলার অগ্রগতি দেখুন।",
      actions: [
        { href: "/disputes/new", label: "বিরোধ দাখিল করুন" },
        { href: "/disputes", label: "আমার বিরোধ" },
      ],
    },
  },

  // ── Grievance / Complaint ─────────────────────────────────────────────────
  {
    keywords: [
      "grievance", "complaint", "complain", "staff conduct", "corruption",
      "bribe", "delay", "technical error", "অভিযোগ", "দুর্নীতি", "ঘুষ", "বিলম্ব",
    ],
    en: {
      reply:
        "Here's how to **File a Complaint / Grievance**:\n\n" +
        "1️⃣ Go to **Complaints & Grievances** in the sidebar.\n" +
        "2️⃣ Click **File a complaint**.\n" +
        "3️⃣ Select the category:\n" +
        "   • **Technical Error** — app bugs or missing records\n" +
        "   • **Unreasonable Delay** — applications taking too long\n" +
        "   • **Staff Conduct** — misbehavior or negligence\n" +
        "   • **Corruption / Bribery** — demand for bribes\n" +
        "4️⃣ Write a clear description (at least 20 characters).\n" +
        "5️⃣ Submit — your complaint goes directly to the administration team.\n\n" +
        "📌 You can track its status and rate the resolution from the grievances page.",
      actions: [{ href: "/grievances/new", label: "File a complaint" }],
    },
    bn: {
      reply:
        "**অভিযোগ** দাখিলের ধাপগুলো:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **অভিযোগ ও প্রতিকার** নির্বাচন করুন।\n" +
        "2️⃣ **অভিযোগ দাখিল করুন** বোতামে ক্লিক করুন।\n" +
        "3️⃣ অভিযোগের ধরন বেছে নিন:\n" +
        "   • **প্রযুক্তিগত ত্রুটি** — অ্যাপে বাগ বা রেকর্ড না পাওয়া\n" +
        "   • **অযৌক্তিক বিলম্ব** — আবেদন দেরি হওয়া\n" +
        "   • **কর্মীদের আচরণ** — অসদাচরণ বা অবহেলা\n" +
        "   • **দুর্নীতি / ঘুষ** — ঘুষ দাবি\n" +
        "4️⃣ বিস্তারিত বিবরণ লিখুন (কমপক্ষে ২০ অক্ষর)।\n" +
        "5️⃣ জমা দিন — সরাসরি প্রশাসন দলের কাছে যাবে।\n\n" +
        "📌 অভিযোগের অবস্থা ট্র্যাক করুন ও নিষ্পত্তির মান রেটিং দিন।",
      actions: [{ href: "/grievances/new", label: "অভিযোগ দাখিল করুন" }],
    },
  },

  // ── Inheritance ───────────────────────────────────────────────────────────
  {
    keywords: [
      "inheritance", "faraiz", "heir", "succession", "উত্তরাধিকার", "ওয়ারিশ", "ফরায়েজ",
    ],
    en: {
      reply:
        "Here's how to use the **Inheritance Calculator**:\n\n" +
        "1️⃣ Go to **Inheritance** in the sidebar.\n" +
        "2️⃣ Choose the succession method: **Faraiz (Muslim)** or **Hindu Succession**.\n" +
        "3️⃣ Enter the deceased's total land area.\n" +
        "4️⃣ Add each heir — their relationship (son, daughter, wife, etc.) and number.\n" +
        "5️⃣ The calculator will instantly show each heir's share.\n\n" +
        "📌 To officially transfer ownership, you'll then need to file a **Mutation** for each heir's share.",
      actions: [
        { href: "/inheritance", label: "Open inheritance calculator" },
        { href: "/mutations/new", label: "File a mutation" },
      ],
    },
    bn: {
      reply:
        "**উত্তরাধিকার ক্যালকুলেটর** ব্যবহারের ধাপগুলো:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **উত্তরাধিকার** নির্বাচন করুন।\n" +
        "2️⃣ উত্তরাধিকার পদ্ধতি বেছে নিন: **ফরায়েজ (মুসলিম)** বা **হিন্দু উত্তরাধিকার**।\n" +
        "3️⃣ মৃত ব্যক্তির মোট জমির পরিমাণ দিন।\n" +
        "4️⃣ প্রতিটি ওয়ারিশ যোগ করুন — সম্পর্ক (পুত্র, কন্যা, স্ত্রী ইত্যাদি) ও সংখ্যাসহ।\n" +
        "5️⃣ ক্যালকুলেটর সাথে সাথে প্রতিটি ওয়ারিশের অংশ দেখাবে।\n\n" +
        "📌 মালিকানা সরকারিভাবে হস্তান্তর করতে প্রতিটি ওয়ারিশের জন্য **নামজারি** দাখিল করতে হবে।",
      actions: [
        { href: "/inheritance", label: "উত্তরাধিকার ক্যালকুলেটর" },
        { href: "/mutations/new", label: "নামজারি দাখিল করুন" },
      ],
    },
  },

  // ── Land Admin / Certified Copy / Correction ──────────────────────────────
  {
    keywords: [
      "certified copy", "certified", "correction", "record correction", "clerical error",
      "land admin", "সার্টিফাইড কপি", "রেকর্ড সংশোধন", "ভুল সংশোধন", "ভূমি প্রশাসন",
    ],
    en: {
      reply:
        "Here's how to use **Land Administration** services:\n\n" +
        "**For a Certified Copy:**\n" +
        "1️⃣ Go to **Land Administration** in the sidebar.\n" +
        "2️⃣ Select **Certified Copy** and choose the parcel.\n" +
        "3️⃣ Pay the fee and submit.\n\n" +
        "**For a Record Correction:**\n" +
        "1️⃣ Go to **Land Administration → Record Correction**.\n" +
        "2️⃣ Select what needs fixing: Owner Name, Land Area, or Other.\n" +
        "3️⃣ Enter the current (wrong) value and the corrected value.\n" +
        "4️⃣ Explain the reason and pay the fee.\n" +
        "5️⃣ Submit — the land office will review and approve.",
      actions: [{ href: "/land-admin", label: "Go to Land Administration" }],
    },
    bn: {
      reply:
        "**ভূমি প্রশাসন** সেবা ব্যবহারের ধাপগুলো:\n\n" +
        "**সার্টিফাইড কপির জন্য:**\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **ভূমি প্রশাসন** নির্বাচন করুন।\n" +
        "2️⃣ **সার্টিফাইড কপি** বেছে দাগ নির্বাচন করুন।\n" +
        "3️⃣ ফি পরিশোধ করুন ও জমা দিন।\n\n" +
        "**রেকর্ড সংশোধনের জন্য:**\n" +
        "1️⃣ **ভূমি প্রশাসন → রেকর্ড সংশোধন** নির্বাচন করুন।\n" +
        "2️⃣ কী ঠিক করতে হবে বেছে নিন: মালিকের নাম, জমির পরিমাণ বা অন্যান্য।\n" +
        "3️⃣ বর্তমান ভুল মান ও সংশোধিত মান দিন।\n" +
        "4️⃣ কারণ ব্যাখ্যা করুন ও ফি পরিশোধ করুন।\n" +
        "5️⃣ জমা দিন — ভূমি অফিস পর্যালোচনা করবে।",
      actions: [{ href: "/land-admin", label: "ভূমি প্রশাসনে যান" }],
    },
  },

  // ── Lease & Settlement ────────────────────────────────────────────────────
  {
    keywords: [
      "lease", "lease settlement", "khas land", "government land", "khas",
      "বন্দোবস্ত", "লিজ", "খাস জমি", "সরকারি জমি",
    ],
    en: {
      reply:
        "Here's how to apply for a **Lease & Settlement** of government (khas) land:\n\n" +
        "1️⃣ Go to **Lease & Settlement** in the sidebar.\n" +
        "2️⃣ Click **New Application**.\n" +
        "3️⃣ Optionally, select a plot from the map — or skip map selection to apply manually.\n" +
        "4️⃣ Choose land use type: **Agricultural** or **Non-Agricultural**.\n" +
        "5️⃣ Enter the location description, area (decimals), lease term (years), and purpose.\n" +
        "6️⃣ Pay the application fee (bKash, Nagad, or Card) and submit.",
      actions: [{ href: "/lease-settlement", label: "Apply for lease" }],
    },
    bn: {
      reply:
        "সরকারি **খাস জমির বন্দোবস্ত / লিজ** আবেদনের ধাপগুলো:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **বন্দোবস্ত** নির্বাচন করুন।\n" +
        "2️⃣ **নতুন আবেদন** বোতামে ক্লিক করুন।\n" +
        "3️⃣ মানচিত্র থেকে একটি দাগ নির্বাচন করুন বা এড়িয়ে নিজে তথ্য দিন।\n" +
        "4️⃣ জমির ধরন বেছে নিন: **কৃষি** বা **অকৃষি**।\n" +
        "5️⃣ অবস্থান, পরিমাণ, মেয়াদ ও উদ্দেশ্য লিখুন।\n" +
        "6️⃣ আবেদন ফি পরিশোধ করুন ও জমা দিন।",
      actions: [{ href: "/lease-settlement", label: "বন্দোবস্তের জন্য আবেদন" }],
    },
  },

  // ── My Parcels / Properties ───────────────────────────────────────────────
  {
    keywords: [
      "my land", "my parcel", "my property", "my holdings", "show parcels",
      "view parcel", "আমার জমি", "আমার সম্পত্তি", "জমি দেখান",
    ],
    en: {
      reply:
        "To **view your land parcels and holdings**:\n\n" +
        "1️⃣ Click **My Properties** in the sidebar.\n" +
        "2️⃣ You'll see all parcels registered in your name with Dag No., area, land use, and registry status.\n" +
        "3️⃣ Click any parcel to see its full details, history, and restrictions.\n\n" +
        "You can also use **Search Records** to find any land record by Dag No. or Khatian No.",
      actions: [
        { href: "/properties", label: "My properties" },
        { href: "/search", label: "Search records" },
      ],
    },
    bn: {
      reply:
        "**আপনার জমির দাগ ও হোল্ডিং দেখতে:**\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **আমার সম্পত্তি** নির্বাচন করুন।\n" +
        "2️⃣ আপনার নামে নিবন্ধিত সব দাগ দাগ নম্বর, পরিমাণ, ব্যবহার ও অবস্থাসহ দেখতে পাবেন।\n" +
        "3️⃣ যেকোনো দাগে ক্লিক করলে সম্পূর্ণ বিবরণ ও ইতিহাস দেখাবে।\n\n" +
        "দাগ নম্বর বা খতিয়ান নম্বর দিয়ে **রেকর্ড খুঁজুন** থেকে যেকোনো রেকর্ড খুঁজতে পারবেন।",
      actions: [
        { href: "/properties", label: "আমার সম্পত্তি" },
        { href: "/search", label: "রেকর্ড খুঁজুন" },
      ],
    },
  },

  // ── Appointment ───────────────────────────────────────────────────────────
  {
    keywords: [
      "appointment", "book appointment", "schedule", "meet officer",
      "অ্যাপয়েন্টমেন্ট", "সাক্ষাৎ", "সময় নিন",
    ],
    en: {
      reply:
        "To **Book an Appointment** with a land office officer:\n\n" +
        "1️⃣ Go to **Appointments** in the sidebar.\n" +
        "2️⃣ Select the service type you need to discuss.\n" +
        "3️⃣ Choose an available date and time slot.\n" +
        "4️⃣ Add a short note about the purpose of your visit.\n" +
        "5️⃣ Confirm — you'll receive a notification with the booking details.",
      actions: [{ href: "/appointments", label: "Book appointment" }],
    },
    bn: {
      reply:
        "ভূমি অফিস কর্মকর্তার সাথে **অ্যাপয়েন্টমেন্ট বুক করতে:**\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **অ্যাপয়েন্টমেন্ট** নির্বাচন করুন।\n" +
        "2️⃣ কোন সেবার জন্য আলোচনা করতে চান তা নির্বাচন করুন।\n" +
        "3️⃣ উপলভ্য তারিখ ও সময় বেছে নিন।\n" +
        "4️⃣ পরিদর্শনের উদ্দেশ্য সম্পর্কে একটি সংক্ষিপ্ত নোট দিন।\n" +
        "5️⃣ নিশ্চিত করুন — আপনি একটি বিজ্ঞপ্তি পাবেন।",
      actions: [{ href: "/appointments", label: "অ্যাপয়েন্টমেন্ট বুক করুন" }],
    },
  },

  // ── Acquisition / Requisition ─────────────────────────────────────────────
  {
    keywords: [
      "acquisition", "requisition", "government acquire", "compensation",
      "অধিগ্রহণ", "হুকুমদখল", "ক্ষতিপূরণ",
    ],
    en: {
      reply:
        "To track an **Acquisition or Requisition** notice on your land:\n\n" +
        "1️⃣ Go to **Acquisition & Requisition** in the sidebar.\n" +
        "2️⃣ View any active acquisition notices against your parcels.\n" +
        "3️⃣ You can review the compensation details and submit objections or documents through this page.\n\n" +
        "📌 If you received an official notice, make sure to check your parcel status under **My Properties** as well.",
      actions: [{ href: "/acquisition", label: "View acquisition notices" }],
    },
    bn: {
      reply:
        "আপনার জমিতে **অধিগ্রহণ / হুকুমদখলের** নোটিশ ট্র্যাক করতে:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **অধিগ্রহণ ও হুকুমদখল** নির্বাচন করুন।\n" +
        "2️⃣ আপনার দাগের বিপরীতে সক্রিয় যেকোনো অধিগ্রহণ নোটিশ দেখুন।\n" +
        "3️⃣ ক্ষতিপূরণের বিবরণ দেখুন এবং আপত্তি বা দলিল জমা দিন।\n\n" +
        "📌 সরকারি নোটিশ পেলে **আমার সম্পত্তি** থেকে দাগের অবস্থাও পরীক্ষা করুন।",
      actions: [{ href: "/acquisition", label: "অধিগ্রহণ নোটিশ দেখুন" }],
    },
  },

  // ── Documents ─────────────────────────────────────────────────────────────
  {
    keywords: [
      "document", "documents", "upload document", "khatian", "title deed", "sale deed",
      "দলিল", "দলিলপত্র", "খতিয়ান", "আপলোড",
    ],
    en: {
      reply:
        "To manage your **Documents**:\n\n" +
        "1️⃣ Go to **My Documents** in the sidebar.\n" +
        "2️⃣ You can view all documents attached to your land records — title deeds, mutation orders, tax receipts, etc.\n" +
        "3️⃣ To upload a new document, open the relevant parcel or application and use the document upload button there.\n\n" +
        "📌 Uploaded documents go through an OCR (text extraction) process before an officer verifies them.",
      actions: [{ href: "/documents", label: "My documents" }],
    },
    bn: {
      reply:
        "আপনার **দলিলপত্র** পরিচালনা করতে:\n\n" +
        "1️⃣ পার্শ্ব মেনু থেকে **আমার দলিলপত্র** নির্বাচন করুন।\n" +
        "2️⃣ আপনার ভূমি রেকর্ডের সাথে সংযুক্ত সব দলিল দেখতে পাবেন।\n" +
        "3️⃣ নতুন দলিল আপলোড করতে সংশ্লিষ্ট দাগ বা আবেদন খুলুন এবং আপলোড বোতাম ব্যবহার করুন।\n\n" +
        "📌 আপলোড করা দলিল ওসিআর প্রক্রিয়ার মধ্যে দিয়ে যায়, তারপর কর্মকর্তা যাচাই করেন।",
      actions: [{ href: "/documents", label: "আমার দলিলপত্র" }],
    },
  },

  // ── General help / what can you do ───────────────────────────────────────
  {
    keywords: [
      "help", "what can you do", "services", "what services", "how to use",
      "সাহায্য", "কী করতে পারি", "সেবা", "কীভাবে ব্যবহার",
    ],
    en: {
      reply:
        "I can guide you through **all VhumiShetu services**. Here's what you can do:\n\n" +
        "🏦 **Land Development Tax** — pay your yearly land tax\n" +
        "📝 **Mutation (e-Namjari)** — transfer land ownership\n" +
        "⚖️ **Disputes** — file and track a boundary or ownership dispute\n" +
        "📣 **Grievances** — report corruption, delays, or staff misconduct\n" +
        "👨‍👩‍👧 **Inheritance** — calculate heir shares (Faraiz/Hindu)\n" +
        "📋 **Land Admin** — get a certified copy or correct a record error\n" +
        "🏞️ **Lease & Settlement** — apply to lease government khas land\n" +
        "🔍 **Search Records** — find any land record by Dag or Khatian No.\n" +
        "📅 **Appointments** — schedule a visit with a land office officer\n\n" +
        "Just ask me about any of these and I'll walk you through it step by step!",
      actions: [{ href: "/portal", label: "Go to all services" }],
    },
    bn: {
      reply:
        "আমি **VhumiShetu-এর সকল সেবায়** আপনাকে গাইড করতে পারি:\n\n" +
        "🏦 **ভূমি উন্নয়ন কর** — বার্ষিক ভূমি কর পরিশোধ\n" +
        "📝 **নামজারি** — জমির মালিকানা হস্তান্তর\n" +
        "⚖️ **বিরোধ** — সীমানা বা মালিকানা বিরোধ দাখিল ও ট্র্যাক\n" +
        "📣 **অভিযোগ** — দুর্নীতি, বিলম্ব বা অসদাচরণের অভিযোগ\n" +
        "👨‍👩‍👧 **উত্তরাধিকার** — ওয়ারিশের অংশ হিসাব করুন\n" +
        "📋 **ভূমি প্রশাসন** — সার্টিফাইড কপি বা রেকর্ড সংশোধন\n" +
        "🏞️ **বন্দোবস্ত** — খাস জমি লিজের আবেদন\n" +
        "🔍 **রেকর্ড খুঁজুন** — দাগ বা খতিয়ান নম্বর দিয়ে রেকর্ড খুঁজুন\n" +
        "📅 **অ্যাপয়েন্টমেন্ট** — কর্মকর্তার সাথে সাক্ষাৎ\n\n" +
        "যেকোনো বিষয়ে জিজ্ঞাসা করুন, আমি ধাপে ধাপে গাইড করব!",
      actions: [{ href: "/portal", label: "সকল সেবা দেখুন" }],
    },
  },
];

/**
 * Scores a message against a rule by counting how many keywords match.
 * Returns 0 if no keywords match.
 */
function scoreRule(message: string, rule: RuleEngineRule): number {
  const lower = message.toLowerCase();
  return rule.keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

/**
 * Offline keyword-based fallback engine. Returns the best-matching rule's
 * response, or a default help prompt if nothing matches.
 */
function ruleEngineReply(
  message: string,
  locale: "en" | "bn",
): { reply: string; suggestedActions: { href: string; label: string }[] } {
  let bestRule: RuleEngineRule | null = null;
  let bestScore = 0;

  for (const rule of RULE_ENGINE_RULES) {
    const score = scoreRule(message, rule);
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  if (bestRule) {
    const r = bestRule[locale];
    return { reply: r.reply, suggestedActions: r.actions };
  }

  // Default fallback
  return {
    reply:
      locale === "bn"
        ? "আমি নিশ্চিত নই আপনি কী জানতে চাইছেন। আপনি কি ভূমি কর, নামজারি, বিরোধ, বা অন্য কোনো সেবার বিষয়ে জিজ্ঞাসা করছেন? আরেকটু বিস্তারিত বললে আমি সাহায্য করতে পারব।"
        : "I'm not sure what you're asking about. Are you asking about land tax, mutation, disputes, or another service? Could you give me a bit more detail?",
    suggestedActions: [{ href: "/portal", label: locale === "bn" ? "সকল সেবা" : "All services" }],
  };
}


/**
 * Every route the assistant may point a citizen to. suggest_action calls
 * naming anything outside this list are dropped — the model chooses when to
 * link, never where the link can go.
 */
const ASSISTANT_ACTION_ROUTES = [
  "/portal",
  "/properties",
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
- Record Search at /search, and each citizen's own holdings at /properties.
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
      const { reply, suggestedActions } = ruleEngineReply(message, locale);
      return { reply, toolCalls: [], suggestedActions };
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

    return `You are VhumiShetu's assistant, helping a citizen use this Bangladeshi land-records portal.
Reply in ${locale === "bn" ? "Bangla" : "English"}, in plain, concise, friendly language.
Only discuss VhumiShetu and Bangladeshi land administration. Never invent data — use the tools for anything about this citizen's own records, and say so plainly if a tool returns nothing.
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
