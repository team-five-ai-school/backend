import { Readable } from "node:stream";

import type { LanguageModel } from "ai";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { extractTasks, streamExtractTasks, type ExtractionInput } from "../ai/extract-tasks.ts";
import { onboardingConfig } from "../config/onboarding.ts";
import { validateAnswers } from "../domain/quiz.ts";
import { error, ErrorBody, IdParams, secured } from "../lib/http.ts";
import { RateLimiter } from "../lib/rate-limit.ts";
import {
  AnswersBody,
  CompleteResponse,
  CreateSessionBody,
  DescribeBody,
  DescribeQuery,
  DescribeResponse,
  RoleOut,
  SessionOut,
} from "../onboarding/schemas.ts";
import type { OnboardingService } from "../onboarding/service.ts";
import { requireAuth } from "../plugins/auth.ts";

export type OnboardingRoutesOptions = {
  service: OnboardingService;
  /** Tests inject a mock model; otherwise the env-configured model (or the fallback) is used. */
  extractionModel?: { model: LanguageModel; modelId: string };
};

const tags = ["onboarding"];

export const onboardingRoutes: FastifyPluginAsyncZod<OnboardingRoutesOptions> = async (app, { service, extractionModel }) => {
  const { perSession, perIp, windowMs } = onboardingConfig.describeLimit;
  const describeLimiter = new RateLimiter(windowMs);

  app.get(
    "/onboarding/roles",
    { schema: { tags, response: { 200: z.array(RoleOut) } } },
    async () => service.listRoles(),
  );

  app.post(
    "/onboarding/sessions",
    { schema: { tags, body: CreateSessionBody, response: { 201: SessionOut, 400: ErrorBody } } },
    async (req, reply) => reply.code(201).send(await service.createSession(req.body.role)),
  );

  // Not in the original list: lets the client restore an onboarding after a reload (sessionId in localStorage).
  app.get(
    "/onboarding/sessions/:id",
    { schema: { tags, params: IdParams, response: { 200: SessionOut, 404: ErrorBody } } },
    async (req) => service.getSession(req.params.id),
  );

  app.patch(
    "/onboarding/sessions/:id/answers",
    {
      schema: { tags, params: IdParams, body: AnswersBody, response: { 200: SessionOut, 400: ErrorBody, 404: ErrorBody, 409: ErrorBody } },
    },
    async (req) => service.saveAnswers(req.params.id, req.body.answers, (quiz) => validateAnswers(quiz, req.body.answers)),
  );

  app.post(
    "/onboarding/sessions/:id/describe",
    {
      schema: {
        tags,
        description:
          "Free text → tasks. By default streams `text/plain` with a JSON document `{ tasks, source }` growing one task at a time (for useObject). `?stream=false` returns it as one JSON response. Never fails because of the model: falls back to the role template.",
        params: IdParams,
        querystring: DescribeQuery,
        body: DescribeBody,
        response: { 200: DescribeResponse, 400: ErrorBody, 404: ErrorBody, 409: ErrorBody, 429: ErrorBody },
      },
    },
    async (req, reply) => {
      if (!describeLimiter.take(`s:${req.params.id}`, perSession) || !describeLimiter.take(`ip:${req.ip}`, perIp)) {
        return reply.code(429).send(error("Too many requests, try again in a few minutes"));
      }
      const ctx = await service.describeContext(req.params.id);
      const { freeText } = req.body;
      const abort = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableFinished) abort.abort();
      });
      const input: ExtractionInput = {
        freeText,
        roleTitle: ctx.roleTitle,
        skills: ctx.skills,
        fallbackTasks: ctx.fallbackTasks,
        log: req.log,
        model: extractionModel,
        signal: abort.signal,
      };

      if (req.query.stream === "false") {
        const result = await extractTasks(input);
        await service.saveDescribed(ctx.session, freeText, result.tasks, result.source);
        return { tasks: result.tasks, source: result.source };
      }

      const body = streamExtractTasks(input, async (result) => {
        await service.saveDescribed(ctx.session, freeText, result.tasks, result.source);
      });
      return reply
        .header("content-type", "text/plain; charset=utf-8")
        .header("cache-control", "no-cache, no-transform")
        .header("x-accel-buffering", "no")
        // A stream skips the response serializer; the 200 schema above documents the final document.
        .send(Readable.from(body) as never);
    },
  );

  app.post(
    "/onboarding/sessions/:id/complete",
    { schema: { tags, params: IdParams, response: { 200: CompleteResponse, 404: ErrorBody, 409: ErrorBody } } },
    async (req) => service.complete(req.params.id),
  );

  app.post(
    "/onboarding/sessions/:id/claim",
    {
      onRequest: requireAuth,
      schema: { tags, security: secured, params: IdParams, response: { 200: SessionOut, 401: ErrorBody, 404: ErrorBody, 409: ErrorBody } },
    },
    async (req) => service.claim(req.params.id, req.user.sub),
  );
};
