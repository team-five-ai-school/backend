import { buildApp } from "./app.ts";
import { runMigrations } from "./db/migrate.ts";
import { env } from "./env.ts";
import { syncContentLessons } from "./catalog/sync-content.ts";
import { db } from "./db/index.ts";
import { seedReferenceData } from "./seed/index.ts";

await runMigrations();
await seedReferenceData();
// Tagged lessons from content/courses.json → catalog; open plan slots get them.
console.log("content lessons synced", await syncContentLessons(db));
const app = await buildApp();
await app.listen({ port: env.PORT, host: "0.0.0.0" });
