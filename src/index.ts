import cors from "cors";
import { sql } from "drizzle-orm";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { z } from "zod";

import { db } from "./db/index.ts";
import { runMigrations } from "./db/migrate.ts";
import { env } from "./env.ts";
import { tasksRouter } from "./routes/tasks.ts";

const app = express();
app.use(cors({ origin: env.CORS_ORIGINS === "*" ? "*" : env.CORS_ORIGINS.split(",").map((o) => o.trim()) }));
app.use(express.json());

app.get("/health", async (_req, res) => {
  await db.execute(sql`select 1`);
  res.json({ status: "ok", db: "ok", commit: env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" });
});

const requireApiKey: RequestHandler = (req, res, next) => {
  if (env.API_KEY && req.get("x-api-key") !== env.API_KEY) return void res.status(401).json({ error: "Invalid API key" });
  next();
};
app.use(requireApiKey);

app.use("/tasks", tasksRouter);

app.use((_req, res) => void res.status(404).json({ error: "Not found" }));

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof z.ZodError) return void res.status(400).json({ error: "Validation failed", issues: err.issues });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);

await runMigrations();
app.listen(env.PORT, "0.0.0.0", () => console.log(`API listening on :${env.PORT}`));
