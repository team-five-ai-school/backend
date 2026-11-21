import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db/index.ts";
import { tasks } from "../db/schema.ts";

// Example resource: copy this file for new resources, then delete it.
export const tasksRouter = Router();

const createSchema = z.object({ title: z.string().trim().min(1).max(500) });
const updateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  done: z.boolean().optional(),
});
const idSchema = z.uuid();

tasksRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(tasks).orderBy(desc(tasks.createdAt)));
});

tasksRouter.get("/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: "Task not found" });
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id.data));
  if (!task) return void res.status(404).json({ error: "Task not found" });
  res.json(task);
});

tasksRouter.post("/", async (req, res) => {
  const body = createSchema.parse(req.body);
  const [task] = await db.insert(tasks).values(body).returning();
  res.status(201).json(task);
});

tasksRouter.patch("/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: "Task not found" });
  const body = updateSchema.parse(req.body);
  const [task] = await db.update(tasks).set(body).where(eq(tasks.id, id.data)).returning();
  if (!task) return void res.status(404).json({ error: "Task not found" });
  res.json(task);
});

tasksRouter.delete("/:id", async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return void res.status(404).json({ error: "Task not found" });
  const [task] = await db.delete(tasks).where(eq(tasks.id, id.data)).returning();
  if (!task) return void res.status(404).json({ error: "Task not found" });
  res.status(204).end();
});
