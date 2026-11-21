# API contracts: onboarding, chaos map, learning plan

Source of truth for request/response shapes: the Zod schemas in `src/onboarding/schemas.ts` (also visible at `/docs`). The frontend mirrors them in `src/lib/contracts/index.ts` (section "Onboarding API"). Keep all three in sync.

Errors are always `{ "error": "..." }`. Ids are uuids, dates are ISO 8601, weekly time is hours (may be fractional).

## Model

```
Skill (taxonomy) ◀── WorkTask.skillSlug        (onboarding: person's work → tasks)
                 ◀── Lesson.skillSlugs[]       (catalog: lessons tagged with skills)
                 ◀── PlanItem.skillSlug        (plan: skill slot → best lesson, or lessonId = null)
```

- `chaosType`: `scattered_channels | manual_transfer | repetitive_replies | reports | status_tracking`
- `aiCapability`: `auto` (AI does it) | `assist` (AI prepares, the person checks) | `human` (needs the person)
- AI share of a task = `hoursPerWeek × factor`, factor `auto 0.8 / assist 0.4 / human 0` (`src/config/onboarding.ts`).

The LLM does exactly one thing today: free text → tasks (with a fallback). Hours, chaos map and plan are computed by code.

## Onboarding (anonymous until claimed)

### `GET /onboarding/roles`
→ `200 [{ slug, title, description }]`

### `POST /onboarding/sessions`
`{ role: "accountant" | "sales_manager" | "small_business_owner" }` → `201 Session` · `400` unknown role

```ts
Session = {
  sessionId, role: { slug, title, description },
  quiz: [{ id, kind: "single" | "multi", text, hint?, options: [{ id, label, description? }] }],
  answers: [{ questionId, optionIds: string[] }],
  status: "started" | "described" | "completed" | "claimed",
  tasks: WorkTask[],            // after describe or complete
  chaosMap: ChaosMap | null,    // after complete
  plan: Plan | null,            // after complete
}
```

The quiz is returned without its hour effects; those stay on the server (`src/seed/roles.ts`).

### `GET /onboarding/sessions/:id`
→ `200 Session` · `404`. Lets the client resume after a reload (the session id lives in `localStorage`).

### `PATCH /onboarding/sessions/:id/answers`
`{ answers: [{ questionId, optionIds }] }` (full list, replaces the previous one) → `200 Session` · `400` unknown question/option, several options on a `single` question · `409` already claimed

### `POST /onboarding/sessions/:id/describe`
`{ freeText }` (1–2000 chars) → `200`, `text/plain` stream · `400` · `404` · `409` · `429` (5 per session, 20 per IP per 10 min)

The body is one JSON document that grows one complete task at a time, for `useObject` from `@ai-sdk/react`:

```json
{"tasks":[{"title":"Instagram leads into the CRM","skillSlug":"messages-to-crm","hoursPerWeek":6,"aiCapability":"auto"}, …],"source":"llm"}
```

- `skillSlug` is restricted to skills in the DB (enum in the schema); hours are clamped to 0–40; at most 12 tasks.
- `source: "template"`: the model was unavailable, timed out (15 s), returned no valid object, or found no tasks. The tasks are then the role template adjusted by the quiz. The client shows them without any failure message.
- Tasks already streamed are never taken back: if the model fails midway, the tasks sent so far are kept.
- `?stream=false` returns the same document as `application/json`.
- The tasks are saved on the session (replacing earlier ones); status → `described`.

### `POST /onboarding/sessions/:id/complete`
→ `200 { tasks: WorkTask[], chaosMap: ChaosMap, plan: Plan }` · `404` · `409` already claimed

Tasks = the ones from describe, otherwise the role template adjusted by the quiz answers. Each call saves a new chaos map version and a new plan version (the previous plan becomes `superseded`). Status → `completed`.

```ts
WorkTask = { id, title, skillSlug, chaosType, hoursPerWeek, aiCapability, source: "template" | "llm" | "user" }

ChaosMap = {
  id, version, createdAt,
  lanes: [{                     // one per skill (tasks with aiCapability ≠ human), sorted by hoursAiCan desc,
    id, kind: "skill" | "human",//  plus one "human" lane "Your decision" (skillSlug and chaosType null)
    skillSlug, title, chaosType, taskIds, hoursTotal, hoursAiCan, aiSharePercent,
  }],
  totals: { hoursTotal, hoursAiCan, hoursHuman, aiSharePercent },   // hoursHuman = hoursTotal − hoursAiCan
}

Plan = {
  id, version, status: "active" | "superseded", createdAt,
  items: [{
    id, order, skillSlug, skillTitle,
    lessonId: string | null, lessonTitle: string | null, lessonSlug: string | null,   // slug = content lesson id
    status: "slot" | "ready" | "in_progress" | "done",   // slot = no published lesson for this skill yet
    sourceTaskIds, estimatedHoursSaved, rationale: string | null,
  }],
}
```

### `POST /onboarding/sessions/:id/claim` (auth)
→ `200 Session` · `401` · `404` · `409` belongs to another account / not completed yet

Links the session, its tasks, chaos maps and plans to the user; the user's plans from other sessions become `superseded`; sets `users.onboarding_completed_at`. Idempotent for the same user.

## Signed-in user

All need `Authorization: Bearer <jwt>` (the frontend proxy adds it from the session cookie).

- `GET /me/plan` → `200 Plan` (latest active) · `404` none yet
- `GET /me/chaos-map` → `200 ChaosMap` (latest) · `404`
- `POST /me/routine-time` `{ taskId, hoursBefore, hoursAfter, measuredAt? }` (hours 0–40) → `201 { id, taskId, hoursBefore, hoursAfter, measuredAt }` · `404` task is not the user's

## Catalog (admin only, skeleton)

- `POST /catalog/courses` `{ slug, title }` → `201`
- `POST /catalog/lessons` `{ courseId, slug, title, skillSlugs[], roles[]?, tools[]?, durationMin, level? }` → `201` (draft) · `400` unknown skill or course
- `POST /catalog/lessons/:id/publish` → `200 Lesson`, then emits `lesson.published`: every plan item with `status = slot` and one of the lesson's skills gets `lessonId` and `status = ready`. Idempotent.

New plans pick lessons with `bestLessonFor(skill, role)`: published, tagged with the skill; a lesson for the person's role first, then the shorter one.

### Lessons from `content/courses.json`

On every start the backend puts the content lessons tagged in `src/catalog/content-skill-map.ts` into the catalog as published lessons (untagged ones stay drafts) and gives every open slot its best lesson for the plan's role. Plan items carry `lessonSlug` (the content lesson id) for the link `/lessons/:lessonSlug`. Roles come only from role-specific courses (`stage: "role"`: `small-business` → `small_business_owner`, `marketing` → `sales_manager`). The tags will move to the course frontmatter later.

## Extension points (not built yet)

- `PlanReranker` (`src/domain/plan.ts`): an LLM step gets only the candidate ids (skill slugs) and returns an order + `rationale`; `applyRerank` drops ids that are not candidates. Today: `IdentityReranker`.
- `AI_MODEL_RERANK`, `AI_MODEL_MENTOR` env slots in `src/ai/models.ts`.
- `DomainEvents` (`src/events`): in-process today; swap for a queue behind the same interface. Planned event: `exercise.failed` for the Mentor.
- Embedding search for lessons: `lessonsForSkills` in `src/catalog/index.ts` is the place to replace.
- Voice input (STT): the frontend shows a disabled "Voice: coming soon" button.
