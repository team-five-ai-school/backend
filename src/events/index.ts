/**
 * In-process domain events. No queue in the project yet: handlers run in this process and `publish`
 * awaits them, so a request that publishes sees the effects. Swap the implementation for a queue
 * (BullMQ etc.) behind the same interface when needed; handlers must stay idempotent.
 *
 * Planned events (not emitted yet): `exercise.failed` for the Mentor.
 */
export type DomainEventMap = {
  "lesson.published": { lessonId: string };
};
export type DomainEventName = keyof DomainEventMap;
type Handler<E extends DomainEventName> = (payload: DomainEventMap[E]) => Promise<unknown> | unknown;
type ErrorLogger = { error: (obj: unknown, msg?: string) => void };

export class DomainEvents {
  private handlers = new Map<DomainEventName, Handler<DomainEventName>[]>();
  private readonly log: ErrorLogger;
  constructor(log: ErrorLogger = console) {
    this.log = log;
  }

  on<E extends DomainEventName>(event: E, handler: Handler<E>) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler as Handler<DomainEventName>]);
  }

  /** Runs every handler; one failing handler is logged and does not stop the others or the caller. */
  async publish<E extends DomainEventName>(event: E, payload: DomainEventMap[E]) {
    const results = await Promise.allSettled((this.handlers.get(event) ?? []).map(async (h) => h(payload)));
    for (const r of results) if (r.status === "rejected") this.log.error({ err: r.reason, event }, "event handler failed");
  }
}
