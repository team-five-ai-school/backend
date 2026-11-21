import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db } from "./index.ts";

/** Applies pending SQL migrations from ./drizzle. Idempotent. */
export async function runMigrations() {
  await migrate(db, { migrationsFolder: "drizzle" });
}

// `npm run db:migrate`
if (import.meta.main) {
  await runMigrations();
  console.log("Migrations applied");
  await db.$client.end();
}
