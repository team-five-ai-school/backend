// Single entry point for drizzle-kit (drizzle.config.ts) and the runtime client (src/db/index.ts).
// One file per domain keeps parallel PRs from conflicting. Export every new table and enum here.
export * from "./_shared.ts";
export * from "./certificates.ts";
export * from "./tasks.ts";
export * from "./users.ts";
export * from "./progress.ts";
export * from "./onboarding.ts";
export * from "./catalog.ts";
export * from "./plans.ts";
export * from "./journal.ts";
