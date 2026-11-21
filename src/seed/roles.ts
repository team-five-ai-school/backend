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
  title: "Бухгалтер малого бізнесу",
  description: "Документи клієнтів, таблиці, нагадування і звітність.",
  defaultTasks: [
    { title: "Фото чеків і рахунків у таблицю", skillSlug: "extract-data-from-documents", hoursPerWeek: 5, aiCapability: "auto" },
    { title: "Нагадування клієнтам про документи", skillSlug: "reminders-followups", hoursPerWeek: 3, aiCapability: "auto" },
    { title: "Зведення для звітності", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "assist" },
    { title: "Розбір документів з Viber і пошти", skillSlug: "triage-messages", hoursPerWeek: 2, aiCapability: "auto" },
    { title: "Спірні витрати й питання клієнтів", skillSlug: "faq-answers", hoursPerWeek: 2, aiCapability: "human" },
  ],
  quiz: [
    {
      id: "acc-clients",
      kind: "single",
      text: "Скільки клієнтів ти ведеш?",
      options: [
        { id: "lt5", label: "До 5", effect: x({ "extract-data-from-documents": 0.6, "reminders-followups": 0.6, "triage-messages": 0.6, "faq-answers": 0.6 }) },
        { id: "5-15", label: "5–15" },
        { id: "15-30", label: "15–30", effect: x({ "extract-data-from-documents": 1.4, "reminders-followups": 1.4, "triage-messages": 1.4, "faq-answers": 1.4 }) },
        { id: "gt30", label: "Більше 30", effect: x({ "extract-data-from-documents": 1.8, "reminders-followups": 1.8, "triage-messages": 1.8, "faq-answers": 1.8 }) },
      ],
    },
    {
      id: "acc-doc-format",
      kind: "single",
      text: "Як клієнти найчастіше передають документи?",
      options: [
        { id: "photos", label: "Фото в месенджерах", effect: x({ "extract-data-from-documents": 1.2, "triage-messages": 1.3 }) },
        { id: "email", label: "Поштою, файлами", effect: x({ "triage-messages": 1.1 }) },
        { id: "paper", label: "Паперові оригінали", effect: x({ "extract-data-from-documents": 1.3 }) },
        { id: "system", label: "Через облікову систему", effect: x({ "extract-data-from-documents": 0.6, "triage-messages": 0.7 }) },
      ],
    },
    {
      id: "acc-channels",
      kind: "multi",
      text: "Де ти отримуєш робочі повідомлення?",
      hint: "Можна обрати кілька.",
      options: [
        { id: "viber", label: "Viber", effect: x({ "triage-messages": 1.15 }) },
        { id: "telegram", label: "Telegram", effect: x({ "triage-messages": 1.15 }) },
        { id: "email", label: "Пошта", effect: x({ "triage-messages": 1.1 }) },
        { id: "phone", label: "Дзвінки", effect: x({ "faq-answers": 1.2 }) },
      ],
    },
    {
      id: "acc-reminders",
      kind: "single",
      text: "Як часто доводиться нагадувати клієнтам про документи?",
      options: [
        { id: "rarely", label: "Майже ніколи", effect: x({ "reminders-followups": 0.3 }) },
        { id: "monthly", label: "Раз на місяць кожному" },
        { id: "often", label: "Кілька разів на місяць", effect: x({ "reminders-followups": 1.5 }) },
      ],
    },
    {
      id: "acc-questions",
      kind: "single",
      text: "Скільки питань від клієнтів на день?",
      options: [
        { id: "lt5", label: "До 5", effect: x({ "faq-answers": 0.5, "triage-messages": 0.8 }) },
        { id: "5-15", label: "5–15" },
        { id: "gt15", label: "Більше 15", effect: x({ "faq-answers": 1.6, "triage-messages": 1.3 }) },
      ],
    },
    {
      id: "acc-reports",
      kind: "single",
      text: "Скільки зведень чи звітів готуєш на місяць?",
      options: [
        { id: "1-2", label: "1–2", effect: x({ "summarize-reports": 0.5 }) },
        { id: "3-5", label: "3–5" },
        { id: "gt5", label: "Більше 5", effect: x({ "summarize-reports": 1.6 }) },
      ],
    },
    {
      id: "acc-ledger",
      kind: "single",
      text: "Де ведеш облік?",
      options: [
        { id: "sheets", label: "Excel або Google Таблиці" },
        { id: "software", label: "Облікова програма", effect: x({ "extract-data-from-documents": 0.9 }) },
        { id: "paper", label: "Здебільшого на папері", effect: x({ "extract-data-from-documents": 1.2, "summarize-reports": 1.2 }) },
      ],
    },
  ],
};

/* ───────── Sales manager ───────── */

const salesManager: RoleSeed = {
  slug: "sales_manager",
  title: "Менеджер з продажу",
  description: "Заявки, CRM, комерційні пропозиції і повторні контакти.",
  defaultTasks: [
    { title: "Заявки з месенджерів у CRM", skillSlug: "messages-to-crm", hoursPerWeek: 3, aiCapability: "auto" },
    { title: "Комерційні пропозиції", skillSlug: "draft-documents", hoursPerWeek: 3, aiCapability: "assist" },
    { title: "Повторні контакти з клієнтами", skillSlug: "reminders-followups", hoursPerWeek: 2, aiCapability: "auto" },
    { title: "Звіт по воронці", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "assist" },
    { title: "Знижки і нестандартні угоди", skillSlug: "draft-replies", hoursPerWeek: 2, aiCapability: "human" },
  ],
  quiz: [
    {
      id: "sal-leads",
      kind: "single",
      text: "Скільки нових заявок на день?",
      options: [
        { id: "lt5", label: "До 5", effect: x({ "messages-to-crm": 0.5, "reminders-followups": 0.7 }) },
        { id: "5-15", label: "5–15" },
        { id: "15-30", label: "15–30", effect: x({ "messages-to-crm": 1.5, "reminders-followups": 1.3 }) },
        { id: "gt30", label: "Більше 30", effect: x({ "messages-to-crm": 2, "reminders-followups": 1.5 }) },
      ],
    },
    {
      id: "sal-channels",
      kind: "multi",
      text: "Звідки приходять заявки?",
      hint: "Можна обрати кілька.",
      options: [
        { id: "instagram", label: "Instagram", effect: x({ "messages-to-crm": 1.1 }) },
        { id: "messengers", label: "Telegram чи Viber", effect: x({ "messages-to-crm": 1.1 }) },
        { id: "site-form", label: "Форма на сайті", effect: x({ "messages-to-crm": 0.9 }) },
        { id: "phone", label: "Дзвінки", effect: x({ "messages-to-crm": 1.1 }) },
        { id: "email", label: "Пошта", effect: x({ "messages-to-crm": 1.05 }) },
      ],
    },
    {
      id: "sal-crm",
      kind: "single",
      text: "Де ти ведеш клієнтів?",
      options: [
        { id: "crm", label: "У CRM" },
        { id: "sheets", label: "У таблиці", effect: x({ "messages-to-crm": 1.2 }) },
        { id: "chats", label: "У месенджері чи блокноті", effect: x({ "messages-to-crm": 1.4, "reminders-followups": 1.3 }) },
      ],
    },
    {
      id: "sal-proposals",
      kind: "single",
      text: "Скільки комерційних пропозицій на тиждень?",
      options: [
        { id: "0-2", label: "0–2", effect: x({ "draft-documents": 0.4 }) },
        { id: "3-7", label: "3–7" },
        { id: "gt7", label: "Більше 7", effect: x({ "draft-documents": 1.7 }) },
      ],
    },
    {
      id: "sal-followups",
      kind: "single",
      text: "Скільки повторних контактів на тиждень?",
      options: [
        { id: "lt10", label: "До 10", effect: x({ "reminders-followups": 0.6 }) },
        { id: "10-30", label: "10–30" },
        { id: "gt30", label: "Більше 30", effect: x({ "reminders-followups": 1.6 }) },
      ],
    },
    {
      id: "sal-report",
      kind: "single",
      text: "Як часто звітуєш по воронці?",
      options: [
        { id: "daily", label: "Щодня", effect: x({ "summarize-reports": 1.8 }) },
        { id: "weekly", label: "Щотижня" },
        { id: "monthly", label: "Щомісяця", effect: x({ "summarize-reports": 0.5 }) },
      ],
    },
    {
      id: "sal-deals",
      kind: "single",
      text: "Як часто бувають нестандартні угоди чи знижки?",
      options: [
        { id: "rarely", label: "Рідко", effect: x({ "draft-replies": 0.5 }) },
        { id: "weekly", label: "Кілька на тиждень" },
        { id: "daily", label: "Щодня", effect: x({ "draft-replies": 1.6 }) },
      ],
    },
  ],
};

/* ───────── Small business owner ───────── */

const smallBusinessOwner: RoleSeed = {
  slug: "small_business_owner",
  title: "Власник кафе чи салону",
  description: "Клієнти, графіки змін, постачальники і продажі.",
  defaultTasks: [
    { title: "Бронювання і відповіді клієнтам", skillSlug: "faq-answers", hoursPerWeek: 4, aiCapability: "auto" },
    { title: "Графік змін", skillSlug: "schedule-planning", hoursPerWeek: 3, aiCapability: "assist" },
    { title: "Закупівлі й прайси постачальників", skillSlug: "explain-table-data", hoursPerWeek: 3, aiCapability: "assist" },
    { title: "Зведення продажів за тиждень", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "auto" },
    { title: "Відгуки і найм", skillSlug: "draft-replies", hoursPerWeek: 3, aiCapability: "human" },
  ],
  quiz: [
    {
      id: "own-messages",
      kind: "single",
      text: "Скільки повідомлень від клієнтів на день?",
      options: [
        { id: "lt10", label: "До 10", effect: x({ "faq-answers": 0.5 }) },
        { id: "10-30", label: "10–30" },
        { id: "30-60", label: "30–60", effect: x({ "faq-answers": 1.5 }) },
        { id: "gt60", label: "Більше 60", effect: x({ "faq-answers": 2 }) },
      ],
    },
    {
      id: "own-booking",
      kind: "single",
      text: "Як клієнти найчастіше бронюють?",
      options: [
        { id: "calls", label: "Дзвонять", effect: x({ "faq-answers": 1.2 }) },
        { id: "messengers", label: "Пишуть у месенджери", effect: x({ "faq-answers": 1.3 }) },
        { id: "online", label: "Онлайн-запис", effect: x({ "faq-answers": 0.6 }) },
        { id: "walk-in", label: "Приходять без запису", effect: x({ "faq-answers": 0.7 }) },
      ],
    },
    {
      id: "own-staff",
      kind: "single",
      text: "Скільки людей працює у змінах?",
      options: [
        { id: "1-3", label: "1–3", effect: x({ "schedule-planning": 0.5 }) },
        { id: "4-10", label: "4–10" },
        { id: "gt10", label: "Більше 10", effect: x({ "schedule-planning": 1.6 }) },
      ],
    },
    {
      id: "own-schedule-changes",
      kind: "single",
      text: "Як часто змінюється графік?",
      options: [
        { id: "rarely", label: "Рідко", effect: x({ "schedule-planning": 0.6 }) },
        { id: "weekly", label: "Щотижня" },
        { id: "often", label: "Кілька разів на тиждень", effect: x({ "schedule-planning": 1.5 }) },
      ],
    },
    {
      id: "own-suppliers",
      kind: "single",
      text: "Скільки у тебе постачальників?",
      options: [
        { id: "1-3", label: "1–3", effect: x({ "explain-table-data": 0.6 }) },
        { id: "4-10", label: "4–10" },
        { id: "gt10", label: "Більше 10", effect: x({ "explain-table-data": 1.5 }) },
      ],
    },
    {
      id: "own-sales-data",
      kind: "single",
      text: "Де ти бачиш продажі?",
      options: [
        { id: "pos", label: "Каса чи програма зі звітами", effect: x({ "summarize-reports": 0.7 }) },
        { id: "sheets", label: "У таблиці" },
        { id: "notebook", label: "У зошиті", effect: x({ "summarize-reports": 1.4 }) },
      ],
    },
    {
      id: "own-reviews",
      kind: "single",
      text: "Скільки відгуків отримуєш на тиждень?",
      options: [
        { id: "lt5", label: "До 5", effect: x({ "draft-replies": 0.6 }) },
        { id: "5-20", label: "5–20" },
        { id: "gt20", label: "Більше 20", effect: x({ "draft-replies": 1.4 }) },
      ],
    },
  ],
};

export const roleSeeds: RoleSeed[] = [accountant, salesManager, smallBusinessOwner];
