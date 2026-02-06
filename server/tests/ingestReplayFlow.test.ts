import { describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/index";

describe("ingest and replay flow", () => {
  it("captures webhook events and replays them", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const app = buildServer({ fetchImpl: fetchMock as typeof fetch });

    const ingestResponse = await app.inject({
      method: "POST",
      url: "/ingest/github?delivery=abc123",
      headers: { "content-type": "application/json" },
      payload: {
        event: "push",
        repository: "hookwatch",
      },
    });

    expect(ingestResponse.statusCode).toBe(200);
    const ingestPayload = ingestResponse.json() as { id: string; received: boolean };
    expect(ingestPayload.received).toBe(true);

    const listResponse = await app.inject({ method: "GET", url: "/api/events" });
    expect(listResponse.statusCode).toBe(200);
    expect((listResponse.json() as { items: unknown[] }).items).toHaveLength(1);

    const replayResponse = await app.inject({
      method: "POST",
      url: `/api/events/${ingestPayload.id}/replay`,
      payload: {
        targetUrl: "https://example.test/webhook",
      },
    });

    expect(replayResponse.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replayResponse.json()).toEqual(
      expect.objectContaining({
        replay: expect.objectContaining({
          statusCode: 202,
          ok: true,
        }),
      })
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/events/${ingestPayload.id}`,
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          source: "github",
          replayHistory: [
            expect.objectContaining({
              statusCode: 202,
            }),
          ],
        }),
      })
    );

    await app.close();
  });
});
