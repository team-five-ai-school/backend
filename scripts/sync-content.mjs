#!/usr/bin/env node
/**
 * Copies course content from the frontend repo (single source of truth: content/courses/*.md → npm run courses:build).
 *   npm run content:sync                  # from ../frontend/content/courses.json (sibling checkout)
 *   npm run content:sync -- --from <path> # from another file
 * Commit the result: the backend serves content from this file.
 */
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { from: { type: "string", default: "../frontend/content/courses.json" } } });
const source = path.resolve(values.from);
const target = path.resolve("content/courses.json");

const { courses } = JSON.parse(await readFile(source, "utf8"));
await copyFile(source, target);
const lessons = courses.reduce((n, c) => n + c.lessons.length, 0);
console.log(`Synced ${courses.length} courses, ${lessons} lessons from ${source} → content/courses.json`);
