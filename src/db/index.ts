import { drizzle } from "drizzle-orm/node-postgres";

import { env } from "../env.ts";
import * as schema from "./schema/index.ts";

// casing must match drizzle.config.ts: camelCase keys in TS, snake_case columns in the DB.
export const db = drizzle(env.DATABASE_URL, { schema, casing: "snake_case" });

export type Db = typeof db;
/** A transaction handle, for helpers that run inside `db.transaction(...)`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
