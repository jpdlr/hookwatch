import type { ReplayResult, WebhookEvent } from "./types.js";

interface ListOptions {
  source?: string;
  search?: string;
}

export class WebhookStore {
  private events: WebhookEvent[] = [];
  private byId = new Map<string, WebhookEvent>();
  private readonly maxEvents: number;

  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents;
  }

  add(event: WebhookEvent): WebhookEvent {
    this.events.unshift(event);
    this.byId.set(event.id, event);

    if (this.events.length > this.maxEvents) {
      const removed = this.events.pop();
      if (removed) {
        this.byId.delete(removed.id);
      }
    }

    return event;
  }

  list(options: ListOptions = {}): WebhookEvent[] {
    const source = options.source?.trim().toLowerCase();
    const search = options.search?.trim().toLowerCase();

    return this.events.filter((event) => {
      const sourceMatches = !source || event.source.toLowerCase() === source;
      if (!sourceMatches) {
        return false;
      }

      if (!search) {
        return true;
      }

      const searchable = [
        event.source,
        event.method,
        event.path,
        event.body ?? "",
        JSON.stringify(event.query),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(search);
    });
  }

  get(id: string): WebhookEvent | undefined {
    return this.byId.get(id);
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
    this.byId.clear();
  }

  addReplay(id: string, replay: ReplayResult): WebhookEvent | undefined {
    const event = this.byId.get(id);
    if (!event) {
      return undefined;
    }
    event.replayHistory.unshift(replay);
    return event;
  }
}
