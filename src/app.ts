import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { sql } from "drizzle-orm";
import Fastify, { type FastifyError } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "./db/index.ts";
import { env } from "./env.ts";
import { registerAuth } from "./plugins/auth.ts";
import { registerEventHandlers } from "./events/handlers.ts";
import { DomainEvents } from "./events/index.ts";
import { onboardingService } from "./onboarding/service.ts";
import { authRoutes } from "./routes/auth.ts";
import { coursesRoutes } from "./routes/courses.ts";
import { progressRoutes } from "./routes/progress.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { meRoutes } from "./routes/me.ts";
import { mentorRoutes } from "./routes/mentor.ts";
import { onboardingRoutes, type OnboardingRoutesOptions } from "./routes/onboarding.ts";
import { tasksRoutes } from "./routes/tasks.ts";


export type BuildAppOptions = {
  logger?: boolean;
  /** Tests inject a mock model for free-text extraction. */
  extractionModel?: OnboardingRoutesOptions["extractionModel"];
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas validate requests and serialize responses.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // One error shape for every route: `{ error, code? }`. 5xx details go to the log, not the client.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(status).send({ error: "Internal server error" });
    }
    return reply.code(status).send({ error: err.message, code: err.code });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: `Route ${req.method} ${req.url} not found` }));

  await app.register(cors, {
    origin: env.CORS_ORIGINS === "*" ? "*" : env.CORS_ORIGINS.split(",").map((o) => o.trim()),
  });

  // Swagger UI at /docs, generated from the route schemas.
  await app.register(swagger, {
    openapi: {
      info: { title: "Team Five API", version: "0.1.0" },
      components: {
        securitySchemes: {
          // Paste the `token` from POST /auth/login. Routes marked with `security: secured` send it.
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.get(
    "/health",
    { schema: { hide: true, response: { 200: z.object({ status: z.string(), db: z.string(), commit: z.string() }) } } },
    async () => {
      await db.execute(sql`select 1`);
      return { status: "ok", db: "ok", commit: env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" };
    },
  );

  // JWT auth: app.jwt.sign(), req.jwtVerify(); protect routes with `onRequest: requireAuth`.
  await registerAuth(app);

  // Feature routes. Each plugin declares its full paths (grep a path to find its owner).
  await app.register(authRoutes);
  await app.register(coursesRoutes);
  await app.register(progressRoutes);
  await app.register(mentorRoutes);

  // Onboarding → chaos map → learning plan. Events are in-process (src/events), handlers stay idempotent.
  const events = new DomainEvents(app.log);
  registerEventHandlers(events, db, app.log);
  const service = onboardingService(db);
  await app.register(onboardingRoutes, { service, extractionModel: options.extractionModel });
  await app.register(meRoutes, { service });
  await app.register(catalogRoutes, { events });

  // Example resource, kept for the frontend /examples/tasks page. Remove both together.
  await app.register(tasksRoutes, { prefix: "/tasks" });

  return app;
}
