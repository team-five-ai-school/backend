import { desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.ts";
import { tasks } from "../db/schema.ts";

// Example resource: copy this file for new resources, register it in src/app.ts, then delete it.

const Task = z.object({ id: z.uuid(), title: z.string(), done: z.boolean(), createdAt: z.date() });
const Params = z.object({ id: z.uuid() });
const NotFound = z.object({ error: z.string() });
const notFound = { error: "Task not found" };

export const tasksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: { tags: ["tasks"], response: { 200: z.array(Task) } } }, async () => {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  });

  app.get(
    "/:id",
    { schema: { tags: ["tasks"], params: Params, response: { 200: Task, 404: NotFound } } },
    async (req, reply) => {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, req.params.id));
      return task ?? reply.code(404).send(notFound);
    },
  );

  app.post(
    "/",
    {
      schema: {
        tags: ["tasks"],
        body: z.object({ title: z.string().trim().min(1).max(500) }),
        response: { 201: Task },
      },
    },
    async (req, reply) => {
      const [task] = await db.insert(tasks).values(req.body).returning();
      return reply.code(201).send(task);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["tasks"],
        params: Params,
        body: z.object({ title: z.string().trim().min(1).max(500).optional(), done: z.boolean().optional() }),
        response: { 200: Task, 404: NotFound },
      },
    },
    async (req, reply) => {
      const [task] = await db.update(tasks).set(req.body).where(eq(tasks.id, req.params.id)).returning();
      return task ?? reply.code(404).send(notFound);
    },
  );

  app.delete(
    "/:id",
    { schema: { tags: ["tasks"], params: Params, response: { 204: z.null(), 404: NotFound } } },
    async (req, reply) => {
      const [task] = await db.delete(tasks).where(eq(tasks.id, req.params.id)).returning();
      return task ? reply.code(204).send(null) : reply.code(404).send(notFound);
    },
  );
};
