import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { UserRole } from "../db/schema/index.ts";
import { env } from "../env.ts";

/** What we put in the JWT. Keep it small: anything else is read from the DB. */
export type AuthUser = { sub: string; role: UserRole };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

/** Registers @fastify/jwt globally: `app.jwt.sign(...)`, `req.jwtVerify()`, `req.user`. */
export async function registerAuth(app: FastifyInstance) {
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: env.JWT_EXPIRES_IN } });
}

/**
 * Route hook: 401 unless the request has a valid `Authorization: Bearer <jwt>`.
 * After it, `req.user.sub` is the user id.
 *
 *   app.get("/me/x", { onRequest: requireAuth, schema: { security: secured } }, handler)
 */
export async function requireAuth(req: FastifyRequest) {
  await req.jwtVerify();
}

/** Route hook: like requireAuth, plus 403 unless the user has one of the roles. */
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await req.jwtVerify();
    if (!roles.includes(req.user.role)) return reply.code(403).send({ error: "Forbidden" });
  };
}
