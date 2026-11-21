/**
 * Which lessons from content/courses.json teach which skill of our taxonomy (src/seed/skills.ts).
 *
 * Temporary home (option "a"): the tags belong next to the content, in the course frontmatter
 * (content/courses/*.md in the frontend repo). Move them there once the content format allows it, then
 * read them from courses.json instead of this file.
 *
 * Rules for editing:
 * - A lesson may teach several skills; a skill may have several lessons (the plan picks one: role match
 *   first, then the shorter lesson).
 * - Leave a skill without lessons rather than tagging a weak match: its plan item stays a slot
 *   («Lesson in preparation») and fills itself when a fitting lesson is tagged.
 * - Hackathon limits: no HR hiring/interview lessons and no legal lessons (ai-for-hr-*, ai-for-lawyers-*).
 */
export const skillLessons: Record<string, string[]> = {
  "triage-messages": ["microsoft-365-copilot-l1", "gemini-in-google-workspace-l1"],
  "extract-data-from-documents": ["chatgpt-for-work-l1", "gemini-in-google-workspace-l2"],
  "messages-to-crm": ["automate-your-routine-l3"],
  "draft-replies": ["ai-for-small-business-l1", "ai-in-office-tools-l1"],
  "faq-answers": ["ai-for-small-business-l1", "automate-your-routine-l2"],
  "draft-documents": ["ai-assistants-101-l2", "microsoft-365-copilot-l2"],
  "summarize-reports": ["ai-in-office-tools-l3", "ai-for-marketing-l3"],
  "explain-table-data": ["ai-for-small-business-l3", "ai-in-office-tools-l2", "microsoft-365-copilot-l3"],
  "reminders-followups": ["automate-your-routine-l1"],
  "schedule-planning": [],
};

/** Audiences of role-specific courses (`recommended_for`) → our onboarding roles. Generic courses get no role. */
export const contentRoleMap: Record<string, string[]> = {
  "small-business": ["small_business_owner"],
  marketing: ["sales_manager"],
};

/** Course id prefixes that must never be tagged (hackathon limits). */
export const excludedCoursePrefixes = ["ai-for-hr", "ai-for-lawyers"];
