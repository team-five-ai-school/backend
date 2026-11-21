import { z } from "zod";

/** Body of every expected error response: `{ "error": "..." }`. */
export const ErrorBody = z.object({ error: z.string() });

export const IdParams = z.object({ id: z.uuid() });

/** Swagger marker for routes behind requireAuth: /docs sends the bearer token (and the API key, if set). */
export const secured = [{ apiKey: [], bearerAuth: [] }];

export const error = (message: string) => ({ error: message });
