# Team Five: backend

Node.js 24 + Fastify 5 + PostgreSQL (Drizzle ORM) + Zod. TypeScript runs natively in Node 24, no build step. Deployed on Railway.

- Production: https://backend-production-29d30b12.up.railway.app (`main`, auto-deploy on push)
- Check what is deployed: `GET /health` → `{"status":"ok","db":"ok","commit":"<sha>"}`

## Run locally

```bash
nvm use                       # Node 24
npm install
cp .env.example .env          # set DATABASE_URL
npm run dev                   # http://localhost:8000, migrations run on start
```

Local Postgres in one command: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app postgres:17-alpine`

## Endpoints

- `GET /health`: app + DB check (Railway healthcheck), deployed commit
- `GET /docs`: Swagger UI, generated from the Zod route schemas. Click Authorize: paste the API key (if set) and the JWT from `POST /auth/login`
- `/auth/register`, `/auth/login`, `/auth/me`: email + password, returns a JWT. Other features are added by their owners (planned API: `../tasks/app-skeleton-spec.md`)
- `/onboarding/*`, `/me/plan`, `/me/chaos-map`, `/me/routine-time`, `/catalog/*` (admin): onboarding → chaos map → learning plan. Contracts: [`docs/api-contracts.md`](docs/api-contracts.md)
- `/tasks`: example CRUD used by the frontend `/examples/tasks` page. Remove both together.

## Code map

```
src/db/schema/<domain>.ts   tables + enums, one file per domain; export new ones from schema/index.ts
src/plugins/auth.ts         JWT setup, requireAuth / requireRole hooks
src/routes/<feature>.ts     one Fastify plugin per feature; each declares its full paths
src/lib/                    password hashing, shared HTTP schemas (ErrorBody, IdParams, `secured`), rate limiter
src/config/onboarding.ts    tunable numbers: AI factors, limits
src/seed/                   skill taxonomy + role templates (quiz with hour effects); upserted on every start
src/domain/                 pure logic: quiz → hours, chaos map, plan builder + reranker hook, slot filling
src/ai/                     the only place that calls models: models.ts (env), prompts/, schemas/, extract-tasks.ts
src/onboarding/             service (DB) + request/response schemas
src/catalog/, src/events/   lesson reader over the DB; in-process domain events (`lesson.published`)
```

## Tests

`npm test` runs unit tests (`node:test`, mock models from `ai/test`). The e2e flow (`src/e2e`) runs only with `TEST_DATABASE_URL` set to a throwaway DB, because it truncates tables:

```bash
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app postgres:17-alpine
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app npm test
```

## Auth

- `POST /auth/login` → `{ token, user }`. Send `Authorization: Bearer <token>` (the frontend proxy does it from the session cookie).
- Protect a route with `onRequest: requireAuth` (or `requireRole("admin")`) and add `security: secured` to its schema so `/docs` sends the token. `req.user.sub` is the user id.
- Errors are always `{ "error": "...", "code"?: "..." }`.

## Adding a table

1. Add it in `src/db/schema/<domain>.ts` and export it from `src/db/schema/index.ts` (camelCase in TS, `snake_case` columns in DB; `casing` is set for drizzle-kit and the runtime client).
2. `npm run db:generate` → review the SQL in `drizzle/`.
3. Add a plugin in `src/routes/`, register it in `src/app.ts`.
4. Commit. Migrations run automatically on every deploy.

Two branches that both add a migration conflict in `drizzle/meta/_journal.json`. Whoever merges second: take the target branch's `drizzle/`, delete your new SQL file, run `npm run db:generate` again.

`npm run db:studio` opens Drizzle Studio against `DATABASE_URL`.

## Conventions

- Declare `body` / `params` / `querystring` / `response` as Zod schemas in the route `schema`: requests are validated (400 on failure), `req.body` is typed, responses are serialized and appear in `/docs`.
- Routes are `FastifyPluginAsyncZod` plugins (see `src/routes/tasks.ts`). Thrown errors become 500s, no try/catch needed.
- Relative imports use the `.ts` extension (`import { db } from "./db/index.ts"`).
- `npm run typecheck` before pushing.

## Env vars

| Var            | What                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL` | Postgres URL. On Railway: `${{Postgres.DATABASE_URL}}` (set already)           |
| `JWT_SECRET`   | **Required in production** (≥ 32 chars, `openssl rand -base64 48`). Set it on Railway before deploying, or the service will not start |
| `JWT_EXPIRES_IN` | Default `7d`, matches the frontend session cookie                            |
| `CORS_ORIGINS` | Comma-separated origins, default `*`                                           |
| `PORT`         | Set by Railway                                                                 |
| `ANTHROPIC_API_KEY` | Optional. Without it, free-text parsing falls back to the role template   |
| `AI_MODEL_EXTRACTION` | Model id for free text → tasks (e.g. `claude-haiku-5-5`). Unset = fallback |
| `AI_MODEL_RERANK`, `AI_MODEL_MENTOR` | Reserved for the next AI steps                          |
| `AI_TIMEOUT_MS` | Per-call timeout, default `15000`                                             |
