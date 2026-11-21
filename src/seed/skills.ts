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
    title: "Розбір вхідних з різних каналів",
    chaosType: "scattered_channels",
    description:
      "Зібрати повідомлення й файли з пошти, Viber, Telegram та інших каналів в одне місце, розсортувати за темою і терміновістю.",
    roles: ["accountant", "sales_manager", "small_business_owner"],
    tools: ["email", "viber", "telegram"],
  },
  {
    slug: "extract-data-from-documents",
    title: "Дані з документів у таблицю",
    chaosType: "manual_transfer",
    description:
      "Перенести дані з фото чеків, рахунків, накладних чи PDF у таблицю або облікову програму без ручного передруку.",
    roles: ["accountant", "small_business_owner"],
    tools: ["google-sheets", "excel"],
  },
  {
    slug: "messages-to-crm",
    title: "Заявки з месенджерів у CRM чи таблицю",
    chaosType: "manual_transfer",
    description:
      "Перетворити заявку з месенджера, соцмереж чи форми на запис у CRM або таблиці: імʼя, контакт, що хоче клієнт, наступний крок.",
    roles: ["sales_manager", "small_business_owner"],
    tools: ["crm", "google-sheets", "telegram", "instagram"],
  },
  {
    slug: "draft-replies",
    title: "Чернетки типових відповідей",
    chaosType: "repetitive_replies",
    description: "Підготувати чернетку відповіді клієнту чи колезі за шаблоном, яку людина перевіряє і надсилає.",
    roles: ["accountant", "sales_manager", "small_business_owner"],
    tools: ["email", "messengers"],
  },
  {
    slug: "faq-answers",
    title: "Відповіді на часті питання",
    chaosType: "repetitive_replies",
    description:
      "Відповідати на питання, що повторюються: ціни, графік роботи, бронювання, які документи потрібні.",
    roles: ["accountant", "small_business_owner"],
    tools: ["messengers", "website-chat"],
  },
  {
    slug: "draft-documents",
    title: "Чернетки листів і пропозицій",
    chaosType: "repetitive_replies",
    description: "Скласти перший варіант листа, комерційної пропозиції чи оголошення з короткого опису.",
    roles: ["sales_manager", "small_business_owner"],
    tools: ["google-docs", "word", "email"],
  },
  {
    slug: "summarize-reports",
    title: "Зведення і звіти",
    chaosType: "reports",
    description: "Зібрати цифри й події за період у коротке зведення або регулярний звіт.",
    roles: ["accountant", "sales_manager", "small_business_owner"],
    tools: ["google-sheets", "excel", "crm"],
  },
  {
    slug: "explain-table-data",
    title: "Аналіз таблиць простими словами",
    chaosType: "reports",
    description:
      "Пояснити, що видно в таблиці: що змінилось, що виділяється, що варто перевірити. Без фінансових чи юридичних висновків.",
    roles: ["small_business_owner", "sales_manager"],
    tools: ["google-sheets", "excel"],
  },
  {
    slug: "reminders-followups",
    title: "Нагадування і повторні контакти",
    chaosType: "status_tracking",
    description: "Стежити, кому і коли треба нагадати чи написати повторно, і готувати ці повідомлення.",
    roles: ["accountant", "sales_manager"],
    tools: ["crm", "google-calendar", "messengers"],
  },
  {
    slug: "schedule-planning",
    title: "Графіки і розклад",
    chaosType: "status_tracking",
    description: "Складати й оновлювати графік змін, записів чи зустрічей з урахуванням побажань і обмежень.",
    roles: ["small_business_owner"],
    tools: ["google-sheets", "google-calendar"],
  },
];
