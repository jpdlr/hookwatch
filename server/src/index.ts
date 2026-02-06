import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { WebhookStore } from "./store.js";
import type { ReplayRequest, WebhookEvent } from "./types.js";

type FetchImpl = typeof fetch;

interface BuildServerOptions {
  store?: WebhookStore;
  fetchImpl?: FetchImpl;
}

const normalizeHeaders = (
  headers: Record<string, string | string[] | undefined>
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result[key.toLowerCase()] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      result[key.toLowerCase()] = value.join(", ");
    }
  }
  return result;
};

const normalizeQuery = (
  query: Record<string, string | string[] | undefined>
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      result[key] = value.join(", ");
    }
  }
  return result;
};

const toBodyString = (value: unknown): string | null => {
  if (typeof value === "undefined" || value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

const replayEvent = async (
  fetchImpl: FetchImpl,
  event: WebhookEvent,
  payload: ReplayRequest
) => {
  const headers: Record<string, string> = {};

  if (payload.includeOriginalHeaders) {
    for (const [key, value] of Object.entries(event.headers)) {
      if (key !== "host" && key !== "content-length") {
        headers[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(payload.additionalHeaders ?? {})) {
    headers[key.toLowerCase()] = value;
  }

  const started = Date.now();
  const response = await fetchImpl(payload.targetUrl, {
    method: event.method,
    headers,
    body:
      event.method === "GET" || event.method === "HEAD" || event.body === null
        ? undefined
        : event.body,
  });

  const body = await response.text();
  const result = {
    replayedAt: new Date().toISOString(),
    targetUrl: payload.targetUrl,
    statusCode: response.status,
    ok: response.ok,
    durationMs: Date.now() - started,
    body,
  };

  return result;
};

export const buildServer = (options: BuildServerOptions = {}) => {
  const app = Fastify({ logger: true });
  const store = options.store ?? new WebhookStore();
  const fetchImpl = options.fetchImpl ?? fetch;

  app.register(cors, { origin: true });

  app.get("/health", async () => ({
    status: "ok",
    events: store.count(),
  }));

  app.all<{ Params: { source: string } }>("/ingest/:source", async (request) => {
    const parsedUrl = new URL(request.url, "http://localhost");
    const event: WebhookEvent = {
      id: randomUUID(),
      source: request.params.source,
      createdAt: new Date().toISOString(),
      method: request.method,
      path: parsedUrl.pathname,
      query: normalizeQuery(request.query as Record<string, string | string[] | undefined>),
      headers: normalizeHeaders(
        request.headers as Record<string, string | string[] | undefined>
      ),
      body: toBodyString(request.body),
      replayHistory: [],
    };

    store.add(event);

    return {
      id: event.id,
      received: true,
    };
  });

  app.get("/api/events", async (request) => {
    const query = request.query as { source?: string; search?: string };
    return {
      items: store.list({ source: query.source, search: query.search }),
    };
  });

  app.get<{ Params: { id: string } }>("/api/events/:id", async (request, reply) => {
    const event = store.get(request.params.id);
    if (!event) {
      return reply.code(404).send({ error: "Event not found" });
    }

    return { item: event };
  });

  app.delete("/api/events", async () => {
    store.clear();
    return { cleared: true };
  });

  app.post<{ Params: { id: string }; Body: ReplayRequest }>(
    "/api/events/:id/replay",
    async (request, reply) => {
      const event = store.get(request.params.id);
      if (!event) {
        return reply.code(404).send({ error: "Event not found" });
      }

      if (!request.body?.targetUrl) {
        return reply.code(400).send({ error: "targetUrl is required" });
      }

      try {
        const replay = await replayEvent(fetchImpl, event, request.body);
        store.addReplay(event.id, {
          replayedAt: replay.replayedAt,
          targetUrl: replay.targetUrl,
          statusCode: replay.statusCode,
          ok: replay.ok,
          durationMs: replay.durationMs,
        });

        return {
          replay: {
            ...replay,
            body: replay.body.slice(0, 4000),
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(502).send({ error: "Replay target failed" });
      }
    }
  );

  return app;
};

const registerStatic = async (app: ReturnType<typeof buildServer>) => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const webDist = join(currentDir, "../../dist/web");

  if (process.env.NODE_ENV === "production" && existsSync(webDist)) {
    const { default: fastifyStatic } = await import("@fastify/static");
    app.register(fastifyStatic, { root: webDist });
  }
};

const start = async () => {
  const app = buildServer();
  await registerStatic(app);

  const port = Number(process.env.PORT ?? 8899);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  void start();
}
