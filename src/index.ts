import { buildApp } from "./app.ts";
import { runMigrations } from "./db/migrate.ts";
import { env } from "./env.ts";
import { seedReferenceData } from "./seed/index.ts";

await runMigrations();
await seedReferenceData();
const app = await buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
