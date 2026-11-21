import { dbSlotRepo } from "../catalog/index.ts";
import type { Db } from "../db/index.ts";
import { fillSlotsForLesson } from "../domain/slots.ts";
import type { DomainEvents } from "./index.ts";

type InfoLogger = { info: (obj: unknown, msg?: string) => void };

export function registerEventHandlers(events: DomainEvents, db: Db, log: InfoLogger) {
  events.on("lesson.published", async ({ lessonId }) => {
    const filled = await fillSlotsForLesson(lessonId, dbSlotRepo(db));
    log.info({ lessonId, filled }, "plan slots filled");
  });
}
