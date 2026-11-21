import { buildApp } from "./app.ts";
import { runMigrations } from "./db/migrate.ts";
import { env } from "./env.ts";

await runMigrations();
const app = await buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
