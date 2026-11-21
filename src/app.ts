import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { sql } from "drizzle-orm";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "./db/index.ts";
import { env } from "./env.ts";
import { tasksRoutes } from "./routes/tasks.ts";

const PUBLIC_PATHS = ["/health", "/docs"];

export async function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas validate requests and serialize responses.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: env.CORS_ORIGINS === "*" ? "*" : env.CORS_ORIGINS.split(",").map((o) => o.trim()),
  });

  // Swagger UI at /docs, generated from the route schemas.
  await app.register(swagger, {
    openapi: {
      info: { title: "Team Five API", version: "0.1.0" },
      components: { securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "x-api-key" } } },
      security: [{ apiKey: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  // If API_KEY is set, every route except /health and /docs requires the X-Api-Key header.
  app.addHook("onRequest", async (req, reply) => {
    if (!env.API_KEY || PUBLIC_PATHS.some((p) => req.url.startsWith(p))) return;
    if (req.headers["x-api-key"] !== env.API_KEY) return reply.code(401).send({ error: "Invalid API key" });
  });

  app.get(
    "/health",
    { schema: { hide: true, response: { 200: z.object({ status: z.string(), db: z.string(), commit: z.string() }) } } },
    async () => {
      await db.execute(sql`select 1`);
      return { status: "ok", db: "ok", commit: env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" };
    },
  );

  await app.register(tasksRoutes, { prefix: "/tasks" });

  return app;
}
