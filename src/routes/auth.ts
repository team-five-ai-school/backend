import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.ts";
import { SKILL_LEVELS, USER_ROLES, users, type User } from "../db/schema/index.ts";
import { error, ErrorBody, secured } from "../lib/http.ts";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/password.ts";
import { requireAuth } from "../plugins/auth.ts";

export const PublicUser = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(USER_ROLES),
  level: z.enum(SKILL_LEVELS).nullable(),
  onboardingCompletedAt: z.date().nullable(),
  createdAt: z.date(),
});

const AuthResponse = z.object({ token: z.string(), user: PublicUser });

const Email = z.email().max(254);
/** Password policy applies at registration only; login accepts any non-empty password. */
const NewPassword = z.string().min(8).max(128);

/** Never return password_hash: map explicitly. */
export const toPublicUser = (u: User): z.infer<typeof PublicUser> => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  level: u.level,
  onboardingCompletedAt: u.onboardingCompletedAt,
  createdAt: u.createdAt,
});

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const issueToken = (user: User) => app.jwt.sign({ sub: user.id, role: user.role });

  app.post(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        body: z.object({ email: Email, password: NewPassword, name: z.string().trim().min(1).max(100) }),
        response: { 201: AuthResponse, 409: ErrorBody },
      },
    },
    async (req, reply) => {
      const { email, password, name } = req.body;
      const [user] = await db
        .insert(users)
        .values({ email: email.toLowerCase(), name, passwordHash: await hashPassword(password) })
        .onConflictDoNothing({ target: users.email })
        .returning();
      if (!user) return reply.code(409).send(error("An account with this email already exists"));
      return reply.code(201).send({ token: issueToken(user), user: toPublicUser(user) });
    },
  );

  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        body: z.object({ email: Email, password: z.string().min(1).max(128) }),
        response: { 200: AuthResponse, 401: ErrorBody },
      },
    },
    async (req, reply) => {
      const [user] = await db.select().from(users).where(eq(users.email, req.body.email.toLowerCase()));
      // Always run scrypt, so response time does not reveal whether the email exists.
      const valid = await verifyPassword(req.body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
      if (!user || !valid) return reply.code(401).send(error("Wrong email or password"));
      return { token: issueToken(user), user: toPublicUser(user) };
    },
  );

  app.get(
    "/auth/me",
    {
      onRequest: requireAuth,
      schema: { tags: ["auth"], security: secured, response: { 200: PublicUser, 401: ErrorBody } },
    },
    async (req, reply) => {
      const [user] = await db.select().from(users).where(eq(users.id, req.user.sub));
      if (!user) return reply.code(401).send(error("User no longer exists"));
      return toPublicUser(user);
    },
  );
};
