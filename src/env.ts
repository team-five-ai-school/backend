import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/app"),
  PORT: z.coerce.number().default(8000),
  /** If set, every route except /health requires the X-Api-Key header. */
  API_KEY: z.string().min(1).optional(),
  /** Comma-separated origins, "*" for any. */
  CORS_ORIGINS: z.string().default("*"),
  /** Signs user JWTs. Required in production; generate with `openssl rand -base64 48`. */
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  /** Token lifetime (ms-style string). Keep it in sync with the frontend session cookie max-age. */
  JWT_EXPIRES_IN: z.string().default("7d"),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
});

const parsed = schema.parse(process.env);

if (!parsed.JWT_SECRET && parsed.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required in production. Set it in the Railway service variables.");
}

export const env = {
  ...parsed,
  /** Local-dev fallback only: production refuses to start without a real secret (see above). */
  JWT_SECRET: parsed.JWT_SECRET ?? "dev-only-insecure-jwt-secret-change-me-0000",
};
