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

---

## Про проєкт (ShiftWork AI)
Підписковий веб-застосунок (з опційним PWA), який вчить офісних працівників використовувати AI у щоденній роботі. Користувач проходить короткий онбординг, AI розкладає його робочий день на задачі («карта хаосу»), а код збирає персональний план навчання з фіксованого каталогу курсів. Кожен урок — це короткі інтерактивні картки, а **Lesson Mentor** (головна AI-фіча) допомагає з помилками. Після проходження плану видається сертифікат.

- Фронтенд: https://github.com/team-five-ai-school/frontend (прод: https://team5-ai.vercel.app, dev: https://team5-ai-dev.vercel.app)
- Бекенд: https://github.com/team-five-ai-school/backend (Railway, `GET /health`)

> Цей README описано на основі історії комітів обох репозиторіїв (`backend` — `main`, `frontend` — `dev`, стан на 21.11.2026), файлів `research/`, `summary/` і документів `docs/`.

---

### 1. Етапи роботи над MVP

**Вибір ідеї.** У репозиторіях цього етапу немає: коміти починаються вже з реалізації. Його видно лише за папкою `research/` (27 файлів) і зведенням болів у `summary/`. Дослідження ішло за такою схемою:

1. Широкий скан ніш для B2C/AI SaaS: навчання, wellness, фітнес, рослини, антидудскролінг, відмова від куріння, фінанси малого бізнесу, ринок prompt-навчання.
2. Ранжування болів і зведення найсильніших. Найсильніший біль: корпоративні AI-тренінги ігнорують реальну роботу людини. На Reddit пишуть «хлопець зачитує нам наші ж посадові інструкції», а за Acorn 2026 61% працівників не пов'язують AI-навчання з результатами роботи.
3. Аналіз конкурентів і матриця фіч, з якої визначено скоуп MVP.
4. Результат: навчальний продукт, привʼязаний до реальних робочих задач людини (роль, карта хаосу, персональний план).

**Хронологія розробки** (за комітами):

| Коли | Що зробили |
| --- | --- |
| 20.11, вечір | Шаблон фронтенду: Next.js 16, shadcn/ui, TanStack Query, CI, правила для AI-агентів; налаштування Vercel |
| 21.11, ранок | Мінімальний бекенд: Node 24 + Postgres + Railway, потім перехід з Express на Fastify (Zod-схеми, Swagger) |
| 21.11, ~13:00 | PWA, 14 курсів / 42 уроки у текстовому форматі з валідатором, документація продукту (специфікація й роадмап) |
| 21.11, ~15:00 | Авторизація (JWT), дизайн-система «stationery», API курсів, серверна перевірка відповідей і прогрес уроків |
| 21.11, ~16:00 | Онбординг (роль → квіз → вільний текст → карта хаосу → план), каталог курсів і плеєр уроків, Lesson Mentor, план із реальних уроків; перший реліз `dev → main` |
| 21.11, ~16:30 | Сертифікати за курс (публічне посилання верифікації, PDF), ґейміфікація прогресу (XP, ранги, штампи), опис дизайн-системи |
| 21.11, ~17:00 | Фінальний сертифікат за пройдений план, лендінг для гостей і назва ShiftWork AI, збереження плану для гостя через реєстрацію, evals для Mentor і онбордингу, тюнінг Mentor на живій моделі |

---

### 2. Розподіл ролей

Ролі визначено за авторством комітів і PR. У git видно тільки код, тож продуктову та дослідницьку частину, питч і презентацію тут не атрибутовано (див. примітку нижче).

| Учасник (git) | Зона відповідальності |
| --- | --- |
| **Maksym Hodunov** | Шаблон і інфраструктура фронтенду (Next.js 16, CI, Vercel, PWA, проксі до бекенду). Контент: 14 курсів, формат і валідатор. API курсів і прогресу, **Lesson Mentor** (бекенд і панель у плеєрі), каталог курсів, плеєр уроків, лендінг. QA і релізи `dev → main` |
| **vasylsynko (Vasya)** | Старт бекенду (Fastify, Postgres, Railway). **Онбординг**: таксономія навичок, карта хаосу, побудова плану, AI-екстракція задач. Дизайн-система «stationery». Ґейміфікація прогресу. **Evals** (Mentor, онбординг). Злиття гілок і релізи |
| **Andrii Petryna** | Авторизація користувачів (бекенд + фронтенд, скелет застосунку), опис дизайн-системи |
| **Diana** | **Сертифікати**: за курс і фінальний за план (таблиці, ідемпотентна видача, публічна верифікація, PDF, заглушка заблокованого сертифіката). |
| **Ivan** | **Unit-економіка** (у git комітів від Ivan немає, роль зазначена зі слів команди) |

---

### 3. Ключова документація рішення

#### Архітектура

```
Браузер ──► Next.js 16 на Vercel ──(/api/backend/* проксі, cookie → Bearer JWT)──► Fastify 5 на Railway ──► PostgreSQL (Drizzle)
                                                                                         │
                                                                                         └──► Claude через Vercel AI SDK (єдине місце: src/ai/)
```

- **Фронтенд:** Next.js 16 (Cache Components, React Compiler, typed routes), shadcn/ui, TanStack Query. UI тільки на токенах теми (ESLint забороняє сирі кольори й градієнти). Мови: EN та UK.
- **Бекенд:** Node 24 (TypeScript без білд-кроку), Fastify 5, Zod-схеми для запитів і відповідей, Swagger на `/docs`, міграції Drizzle застосовуються на старті. Авторизація: email + пароль, JWT.
- **Контент:** файли курсів у `content/courses/` → `courses.json`, синхронізується з фронтенду в бекенд (14 курсів, 42 уроки). Відповіді на вправи перевіряє сервер, клієнт їх не отримує.
- **AI-компоненти:**
  - Витяг задач із вільного тексту — `claude-haiku-5-5`.
  - Lesson Mentor і підсумок уроку — `claude-opus-5-5`.
  - Моделі й ключ задаються лише через env. Без ключа працюють детерміновані фолбеки, а `AI_SIMULATE` дає локальну симуляцію.
- **Домени БД:** users, onboarding/chaos map, plans, catalog, progress (спроби вправ, завершення уроків), journal, certificates, plan_certificates, tasks (приклад).
- **Деталі:** специфікація продукту й гібридний роадмап — у `frontend/docs/`, контракти API — у `backend/docs/`, формат курсів — у `frontend/content/`, evals — у `frontend/evals/`.

#### Trade-offs

| Рішення | Що виграли | Чим заплатили |
| --- | --- | --- |
| **Код будує план, AI персоналізує.** Код відповідає за правила (курси, пререквізити, порядок), AI за «чому» і фокус-уроки. Відповідь моделі валідується, а при помилці береться план від коду | Передбачуваність, є повноцінний фолбек, AI не вигадає неіснуючий курс | Менше «магії», ніж у повністю генеративного плану |
| **Курси як фіксований каталог файлів** (14 курсів, згенеровані й перевірені окремими агентами) | Швидкий старт, контроль якості, серверна перевірка вправ | Немає генерації уроків під користувача й повного каталогу |
| **Fastify + Zod замість Express** | Валідація і Swagger з одних схем, типізовані хендлери | Перехід посеред першого дня |
| **Лише JWT, X-Api-Key прибрано** | Одна модель авторизації | Додатковий API-ключ для інструментів більше не працює |
| **Mentor: короткі відповіді, жорсткий захист відповідей** (до розкриття вправи Mentor не обговорює варіанти) | Затримка впала з 6–7 с до 3,5–4 с, немає підказок «в лоб» | Менш розлогі пояснення |
| **Сертифікат без акредитації** (не диплом; дисклеймер у самому аркуші) | Юридична простота, публічне посилання верифікації не відкликається | Без офіційної цінності |
| **PDF сертифіката генерується в браузері** (`html-to-image` + `jspdf`) | Нуль серверних витрат, збігається з екраном у світлій і темній темі | Залежить від браузера клієнта |
| **PWA опційне, push-сповіщення прибрано** | Встановлення на домашній екран без складності | Без нагадувань |
| **Evals з LLM-суддею** (Mentor — 22 кейси, онбординг — 20) | Регресії промптів видно до релізу | Додаткові виклики моделей |

#### Витрати (costs)

За unit-економіку відповідав Ivan. Його розрахунків у репозиторіях немає: вартість запиту, ціна за користувача й рахунки хостингу ніде не зафіксовані, тож цифр тут свідомо немає (їх варто додати від Ivan). Є лише те, що відомо зі стеку:

- **Інфраструктура:** Vercel (фронтенд, прод і dev), Railway (бекенд + Postgres).
- **LLM:** Haiku — на дешевий витяг задач, Opus — на Mentor і підсумок уроку. Основна стаття витрат — виклики Mentor.
- **Як зменшували витрати:** серверні перевірки вправ і побудова плану роблять без LLM, відповіді Mentor обмежені 1–3 реченнями, PDF рахується на клієнті, фолбеки працюють без ключа.
- **Unit economics:** специфікація продукту планує таблицю `ai_calls` (токени, вартість, затримка). У схемі бекенду такої таблиці не видно, тож вартість на користувача поки не вимірюється.

> **Що варто доповнити вручну:** хто відповідав за ресерч, вибір ідеї, продукт, питч і презентацію (у git цього не видно), а також розрахунки unit-економіки від Ivan: фактичні ціни моделей і хостингу.
