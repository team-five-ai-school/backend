import type { DefaultTask, QuizQuestionConfig } from "../db/schema/index.ts";

export type RoleSeed = {
  slug: string;
  title: string;
  description: string;
  quiz: QuizQuestionConfig[];
  defaultTasks: DefaultTask[];
};

/** Option effect: multiply the hours of template tasks with these skills (several answers multiply together). */
const x = (multiply: Record<string, number>) => ({ multiply });

/* ───────── Accountant ───────── */

const accountant: RoleSeed = {
  slug: "accountant",
  title: "Small business accountant",
  description: "Client documents, spreadsheets, reminders and reporting.",
  defaultTasks: [
    { title: "Receipt and invoice photos into a spreadsheet", skillSlug: "extract-data-from-documents", hoursPerWeek: 5, aiCapability: "auto" },
    { title: "Reminding clients about documents", skillSlug: "reminders-followups", hoursPerWeek: 3, aiCapability: "auto" },
    { title: "Summaries for reporting", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "assist" },
    { title: "Sorting documents from Viber and email", skillSlug: "triage-messages", hoursPerWeek: 2, aiCapability: "auto" },
    { title: "Disputed expenses and client questions", skillSlug: "faq-answers", hoursPerWeek: 2, aiCapability: "human" },
  ],
  quiz: [
    {
      id: "acc-clients",
      kind: "single",
      text: "How many clients do you handle?",
      options: [
        { id: "lt5", label: "Up to 5", effect: x({ "extract-data-from-documents": 0.6, "reminders-followups": 0.6, "triage-messages": 0.6, "faq-answers": 0.6 }) },
        { id: "5-15", label: "5–15" },
        { id: "15-30", label: "15–30", effect: x({ "extract-data-from-documents": 1.4, "reminders-followups": 1.4, "triage-messages": 1.4, "faq-answers": 1.4 }) },
        { id: "gt30", label: "More than 30", effect: x({ "extract-data-from-documents": 1.8, "reminders-followups": 1.8, "triage-messages": 1.8, "faq-answers": 1.8 }) },
      ],
    },
    {
      id: "acc-doc-format",
      kind: "single",
      text: "How do clients usually send documents?",
      options: [
        { id: "photos", label: "Photos in messengers", effect: x({ "extract-data-from-documents": 1.2, "triage-messages": 1.3 }) },
        { id: "email", label: "Files by email", effect: x({ "triage-messages": 1.1 }) },
        { id: "paper", label: "Paper originals", effect: x({ "extract-data-from-documents": 1.3 }) },
        { id: "system", label: "Through an accounting system", effect: x({ "extract-data-from-documents": 0.6, "triage-messages": 0.7 }) },
      ],
    },
    {
      id: "acc-channels",
      kind: "multi",
      text: "Where do you get work messages?",
      hint: "Pick all that apply.",
      options: [
        { id: "viber", label: "Viber", effect: x({ "triage-messages": 1.15 }) },
        { id: "telegram", label: "Telegram", effect: x({ "triage-messages": 1.15 }) },
        { id: "email", label: "Email", effect: x({ "triage-messages": 1.1 }) },
        { id: "phone", label: "Phone calls", effect: x({ "faq-answers": 1.2 }) },
      ],
    },
    {
      id: "acc-reminders",
      kind: "single",
      text: "How often do you remind clients about documents?",
      options: [
        { id: "rarely", label: "Almost never", effect: x({ "reminders-followups": 0.3 }) },
        { id: "monthly", label: "Once a month, each client" },
        { id: "often", label: "Several times a month", effect: x({ "reminders-followups": 1.5 }) },
      ],
    },
    {
      id: "acc-questions",
      kind: "single",
      text: "How many client questions a day?",
      options: [
        { id: "lt5", label: "Up to 5", effect: x({ "faq-answers": 0.5, "triage-messages": 0.8 }) },
        { id: "5-15", label: "5–15" },
        { id: "gt15", label: "More than 15", effect: x({ "faq-answers": 1.6, "triage-messages": 1.3 }) },
      ],
    },
    {
      id: "acc-reports",
      kind: "single",
      text: "How many summaries or reports do you prepare a month?",
      options: [
        { id: "1-2", label: "1–2", effect: x({ "summarize-reports": 0.5 }) },
        { id: "3-5", label: "3–5" },
        { id: "gt5", label: "More than 5", effect: x({ "summarize-reports": 1.6 }) },
      ],
    },
    {
      id: "acc-ledger",
      kind: "single",
      text: "Where do you keep the books?",
      options: [
        { id: "sheets", label: "Excel or Google Sheets" },
        { id: "software", label: "Accounting software", effect: x({ "extract-data-from-documents": 0.9 }) },
        { id: "paper", label: "Mostly on paper", effect: x({ "extract-data-from-documents": 1.2, "summarize-reports": 1.2 }) },
      ],
    },
  ],
};

/* ───────── Sales manager ───────── */

const salesManager: RoleSeed = {
  slug: "sales_manager",
  title: "Sales manager",
  description: "Leads, CRM, sales proposals and follow-ups.",
  defaultTasks: [
    { title: "Leads from messengers into the CRM", skillSlug: "messages-to-crm", hoursPerWeek: 3, aiCapability: "auto" },
    { title: "Sales proposals", skillSlug: "draft-documents", hoursPerWeek: 3, aiCapability: "assist" },
    { title: "Follow-ups with clients", skillSlug: "reminders-followups", hoursPerWeek: 2, aiCapability: "auto" },
    { title: "Sales funnel report", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "assist" },
    { title: "Discounts and non-standard deals", skillSlug: "draft-replies", hoursPerWeek: 2, aiCapability: "human" },
  ],
  quiz: [
    {
      id: "sal-leads",
      kind: "single",
      text: "How many new leads a day?",
      options: [
        { id: "lt5", label: "Up to 5", effect: x({ "messages-to-crm": 0.5, "reminders-followups": 0.7 }) },
        { id: "5-15", label: "5–15" },
        { id: "15-30", label: "15–30", effect: x({ "messages-to-crm": 1.5, "reminders-followups": 1.3 }) },
        { id: "gt30", label: "More than 30", effect: x({ "messages-to-crm": 2, "reminders-followups": 1.5 }) },
      ],
    },
    {
      id: "sal-channels",
      kind: "multi",
      text: "Where do leads come from?",
      hint: "Pick all that apply.",
      options: [
        { id: "instagram", label: "Instagram", effect: x({ "messages-to-crm": 1.1 }) },
        { id: "messengers", label: "Telegram or Viber", effect: x({ "messages-to-crm": 1.1 }) },
        { id: "site-form", label: "Website form", effect: x({ "messages-to-crm": 0.9 }) },
        { id: "phone", label: "Phone calls", effect: x({ "messages-to-crm": 1.1 }) },
        { id: "email", label: "Email", effect: x({ "messages-to-crm": 1.05 }) },
      ],
    },
    {
      id: "sal-crm",
      kind: "single",
      text: "Where do you keep track of clients?",
      options: [
        { id: "crm", label: "In a CRM" },
        { id: "sheets", label: "In a spreadsheet", effect: x({ "messages-to-crm": 1.2 }) },
        { id: "chats", label: "In a messenger or a notebook", effect: x({ "messages-to-crm": 1.4, "reminders-followups": 1.3 }) },
      ],
    },
    {
      id: "sal-proposals",
      kind: "single",
      text: "How many sales proposals a week?",
      options: [
        { id: "0-2", label: "0–2", effect: x({ "draft-documents": 0.4 }) },
        { id: "3-7", label: "3–7" },
        { id: "gt7", label: "More than 7", effect: x({ "draft-documents": 1.7 }) },
      ],
    },
    {
      id: "sal-followups",
      kind: "single",
      text: "How many follow-ups a week?",
      options: [
        { id: "lt10", label: "Up to 10", effect: x({ "reminders-followups": 0.6 }) },
        { id: "10-30", label: "10–30" },
        { id: "gt30", label: "More than 30", effect: x({ "reminders-followups": 1.6 }) },
      ],
    },
    {
      id: "sal-report",
      kind: "single",
      text: "How often do you report on the funnel?",
      options: [
        { id: "daily", label: "Daily", effect: x({ "summarize-reports": 1.8 }) },
        { id: "weekly", label: "Weekly" },
        { id: "monthly", label: "Monthly", effect: x({ "summarize-reports": 0.5 }) },
      ],
    },
    {
      id: "sal-deals",
      kind: "single",
      text: "How often do non-standard deals or discounts come up?",
      options: [
        { id: "rarely", label: "Rarely", effect: x({ "draft-replies": 0.5 }) },
        { id: "weekly", label: "A few a week" },
        { id: "daily", label: "Daily", effect: x({ "draft-replies": 1.6 }) },
      ],
    },
  ],
};

/* ───────── Small business owner ───────── */

const smallBusinessOwner: RoleSeed = {
  slug: "small_business_owner",
  title: "Café or salon owner",
  description: "Customers, shift schedules, suppliers and sales.",
  defaultTasks: [
    { title: "Bookings and replies to customers", skillSlug: "faq-answers", hoursPerWeek: 4, aiCapability: "auto" },
    { title: "Shift schedule", skillSlug: "schedule-planning", hoursPerWeek: 3, aiCapability: "assist" },
    { title: "Purchasing and supplier price lists", skillSlug: "explain-table-data", hoursPerWeek: 3, aiCapability: "assist" },
    { title: "Weekly sales summary", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "auto" },
    { title: "Reviews and hiring", skillSlug: "draft-replies", hoursPerWeek: 3, aiCapability: "human" },
  ],
  quiz: [
    {
      id: "own-messages",
      kind: "single",
      text: "How many customer messages a day?",
      options: [
        { id: "lt10", label: "Up to 10", effect: x({ "faq-answers": 0.5 }) },
        { id: "10-30", label: "10–30" },
        { id: "30-60", label: "30–60", effect: x({ "faq-answers": 1.5 }) },
        { id: "gt60", label: "More than 60", effect: x({ "faq-answers": 2 }) },
      ],
    },
    {
      id: "own-booking",
      kind: "single",
      text: "How do customers usually book?",
      options: [
        { id: "calls", label: "They call", effect: x({ "faq-answers": 1.2 }) },
        { id: "messengers", label: "They message us", effect: x({ "faq-answers": 1.3 }) },
        { id: "online", label: "Online booking", effect: x({ "faq-answers": 0.6 }) },
        { id: "walk-in", label: "They walk in", effect: x({ "faq-answers": 0.7 }) },
      ],
    },
    {
      id: "own-staff",
      kind: "single",
      text: "How many people work in shifts?",
      options: [
        { id: "1-3", label: "1–3", effect: x({ "schedule-planning": 0.5 }) },
        { id: "4-10", label: "4–10" },
        { id: "gt10", label: "More than 10", effect: x({ "schedule-planning": 1.6 }) },
      ],
    },
    {
      id: "own-schedule-changes",
      kind: "single",
      text: "How often does the schedule change?",
      options: [
        { id: "rarely", label: "Rarely", effect: x({ "schedule-planning": 0.6 }) },
        { id: "weekly", label: "Weekly" },
        { id: "often", label: "Several times a week", effect: x({ "schedule-planning": 1.5 }) },
      ],
    },
    {
      id: "own-suppliers",
      kind: "single",
      text: "How many suppliers do you have?",
      options: [
        { id: "1-3", label: "1–3", effect: x({ "explain-table-data": 0.6 }) },
        { id: "4-10", label: "4–10" },
        { id: "gt10", label: "More than 10", effect: x({ "explain-table-data": 1.5 }) },
      ],
    },
    {
      id: "own-sales-data",
      kind: "single",
      text: "Where do you see your sales?",
      options: [
        { id: "pos", label: "Till or software with reports", effect: x({ "summarize-reports": 0.7 }) },
        { id: "sheets", label: "In a spreadsheet" },
        { id: "notebook", label: "In a notebook", effect: x({ "summarize-reports": 1.4 }) },
      ],
    },
    {
      id: "own-reviews",
      kind: "single",
      text: "How many reviews do you get a week?",
      options: [
        { id: "lt5", label: "Up to 5", effect: x({ "draft-replies": 0.6 }) },
        { id: "5-20", label: "5–20" },
        { id: "gt20", label: "More than 20", effect: x({ "draft-replies": 1.4 }) },
      ],
    },
  ],
};

export const roleSeeds: RoleSeed[] = [accountant, salesManager, smallBusinessOwner];
