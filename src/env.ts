import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/app"),
  PORT: z.coerce.number().default(8000),
  /** If set, every route except /health requires the X-Api-Key header. */
  API_KEY: z.string().min(1).optional(),
  /** Comma-separated origins, "*" for any. */
  CORS_ORIGINS: z.string().default("*"),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
});

export const env = schema.parse(process.env);
