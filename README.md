# Team Five: backend

Node.js 24 + Express 5 + PostgreSQL (Drizzle ORM) + Zod. TypeScript runs natively in Node 24, no build step. Deployed on Railway.

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
- `/tasks`: example CRUD matching the frontend `Task` type (`id`, `title`, `done`, `createdAt`). Copy `src/routes/tasks.ts` for new resources, then delete it.

## Adding a table

1. Add it in `src/db/schema.ts` (camelCase in TS, `snake_case` columns in DB).
2. `npm run db:generate` → review the SQL in `drizzle/`.
3. Add a router in `src/routes/`, mount it in `src/index.ts`.
4. Commit. Migrations run automatically on every deploy.

`npm run db:studio` opens Drizzle Studio against `DATABASE_URL`.

## Conventions

- Validate request bodies with Zod (`schema.parse(req.body)`); a `ZodError` becomes a 400 automatically.
- Express 5 catches errors from async handlers, no try/catch needed.
- Relative imports use the `.ts` extension (`import { db } from "./db/index.ts"`).
- `npm run typecheck` before pushing.

## Env vars

| Var            | What                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL` | Postgres URL. On Railway: `${{Postgres.DATABASE_URL}}` (set already)           |
| `API_KEY`      | Optional. If set, every route except `/health` requires the `X-Api-Key` header |
| `CORS_ORIGINS` | Comma-separated origins, default `*`                                           |
| `PORT`         | Set by Railway                                                                 |
