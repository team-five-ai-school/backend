import type { ChaosType } from "../db/schema/index.ts";

export type SkillSeed = {
  slug: string;
  title: string;
  chaosType: ChaosType;
  description: string;
  roles: string[];
  tools: string[];
};

/** The skill taxonomy. Tasks (from onboarding) and lessons (from the catalog) are tagged with these slugs. */
export const skillSeeds: SkillSeed[] = [
  {
    slug: "triage-messages",
    title: "Sorting messages from many channels",
    chaosType: "scattered_channels",
    description:
      "Collect messages and files from email, Viber, Telegram and other channels in one place and sort them by topic and urgency.",
    roles: ["accountant", "sales_manager", "small_business_owner"],
    tools: ["email", "viber", "telegram"],
  },
  {
    slug: "extract-data-from-documents",
    title: "Document data into a spreadsheet",
    chaosType: "manual_transfer",
    description:
      "Move data from photos of receipts, invoices, delivery notes or PDFs into a spreadsheet or accounting tool without retyping it.",
    roles: ["accountant", "small_business_owner"],
    tools: ["google-sheets", "excel"],
  },
  {
    slug: "messages-to-crm",
    title: "Leads from messengers into a CRM or sheet",
    chaosType: "manual_transfer",
    description:
      "Turn a request from a messenger, social network or form into a CRM or spreadsheet record: name, contact, what the client wants, next step.",
    roles: ["sales_manager", "small_business_owner"],
    tools: ["crm", "google-sheets", "telegram", "instagram"],
  },
  {
    slug: "draft-replies",
    title: "Drafts of typical replies",
    chaosType: "repetitive_replies",
    description: "Prepare a draft reply to a client or colleague from a template; the person checks and sends it.",
    roles: ["accountant", "sales_manager", "small_business_owner"],
    tools: ["email", "messengers"],
  },
  {
    slug: "faq-answers",
    title: "Answers to frequent questions",
    chaosType: "repetitive_replies",
    description:
      "Answer questions that keep coming back: prices, opening hours, bookings, which documents are needed.",
    roles: ["accountant", "small_business_owner"],
    tools: ["messengers", "website-chat"],
  },
  {
    slug: "draft-documents",
    title: "Drafts of emails and proposals",
    chaosType: "repetitive_replies",
    description: "Write a first version of an email, a sales proposal or an announcement from a short brief.",
    roles: ["sales_manager", "small_business_owner"],
    tools: ["google-docs", "word", "email"],
  },
  {
    slug: "summarize-reports",
    title: "Summaries and reports",
    chaosType: "reports",
    description: "Pull the numbers and events of a period into a short summary or a regular report.",
    roles: ["accountant", "sales_manager", "small_business_owner"],
    tools: ["google-sheets", "excel", "crm"],
  },
  {
    slug: "explain-table-data",
    title: "Spreadsheets explained in plain words",
    chaosType: "reports",
    description:
      "Explain what a spreadsheet shows: what changed, what stands out, what to double-check. No financial or legal conclusions.",
    roles: ["small_business_owner", "sales_manager"],
    tools: ["google-sheets", "excel"],
  },
  {
    slug: "reminders-followups",
    title: "Reminders and follow-ups",
    chaosType: "status_tracking",
    description: "Keep track of who needs a reminder or a follow-up and when, and prepare those messages.",
    roles: ["accountant", "sales_manager"],
    tools: ["crm", "google-calendar", "messengers"],
  },
  {
    slug: "schedule-planning",
    title: "Schedules and shifts",
    chaosType: "status_tracking",
    description: "Build and update a shift, appointment or meeting schedule that respects people's wishes and limits.",
    roles: ["small_business_owner"],
    tools: ["google-sheets", "google-calendar"],
  },
];
