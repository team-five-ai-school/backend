import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { db } from "../db/index.ts";
import { routineTimeLogs } from "../db/schema/index.ts";
import { error, ErrorBody, secured } from "../lib/http.ts";
import { ChaosMapOut, PlanOut, RoutineTimeBody, RoutineTimeOut } from "../onboarding/schemas.ts";
import type { OnboardingService } from "../onboarding/service.ts";
import { requireAuth } from "../plugins/auth.ts";

const tags = ["me"];

/** The signed-in user's plan, chaos map and routine time. Data appears here after POST /onboarding/sessions/:id/claim. */
export const meRoutes: FastifyPluginAsyncZod<{ service: OnboardingService }> = async (app, { service }) => {
  app.addHook("onRequest", requireAuth);

  app.get(
    "/me/plan",
    { schema: { tags, security: secured, response: { 200: PlanOut, 401: ErrorBody, 404: ErrorBody } } },
    async (req, reply) => (await service.planForUser(req.user.sub)) ?? reply.code(404).send(error("No plan yet")),
  );

  app.get(
    "/me/chaos-map",
    { schema: { tags, security: secured, response: { 200: ChaosMapOut, 401: ErrorBody, 404: ErrorBody } } },
    async (req, reply) => (await service.chaosMapForUser(req.user.sub)) ?? reply.code(404).send(error("No chaos map yet")),
  );

  app.post(
    "/me/routine-time",
    {
      schema: { tags, security: secured, body: RoutineTimeBody, response: { 201: RoutineTimeOut, 401: ErrorBody, 404: ErrorBody } },
    },
    async (req, reply) => {
      const { taskId, hoursBefore, hoursAfter, measuredAt } = req.body;
      if (!(await service.userOwnsTask(req.user.sub, taskId))) return reply.code(404).send(error("Task not found"));
      const [row] = await db
        .insert(routineTimeLogs)
        .values({ userId: req.user.sub, taskId, hoursBefore, hoursAfter, ...(measuredAt && { measuredAt: new Date(measuredAt) }) })
        .returning();
      return reply.code(201).send(row!);
    },
  );
};
