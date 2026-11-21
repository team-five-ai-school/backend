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
- `GET /docs`: Swagger UI, generated from the Zod route schemas (click Authorize, paste the API key)
- `/tasks`: example CRUD matching the frontend `Task` type (`id`, `title`, `done`, `createdAt`). Copy `src/routes/tasks.ts` for new resources, then delete it.

## Adding a table

1. Add it in `src/db/schema.ts` (camelCase in TS, `snake_case` columns in DB).
2. `npm run db:generate` → review the SQL in `drizzle/`.
3. Add a plugin in `src/routes/`, register it in `src/app.ts` with a `prefix`.
4. Commit. Migrations run automatically on every deploy.

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
| `API_KEY`      | Optional. If set, every route except `/health`, `/docs` requires `X-Api-Key`   |
| `CORS_ORIGINS` | Comma-separated origins, default `*`                                           |
| `PORT`         | Set by Railway                                                                 |
