import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

type EventItem = {
  id: string;
  source: string;
  createdAt: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | null;
  replayHistory: Array<{
    replayedAt: string;
    targetUrl: string;
    statusCode: number;
    ok: boolean;
    durationMs: number;
  }>;
};

const makeJson = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("Hookwatch app", () => {
  const fetchMock = vi.fn();
  let events: EventItem[];

  beforeEach(() => {
    events = [
      {
        id: "evt_1",
        source: "github",
        createdAt: "2026-02-06T12:00:00.000Z",
        method: "POST",
        path: "/ingest/github",
        query: {},
        headers: { "content-type": "application/json" },
        body: "{\"event\":\"push\"}",
        replayHistory: [],
      },
      {
        id: "evt_2",
        source: "stripe",
        createdAt: "2026-02-06T12:01:00.000Z",
        method: "POST",
        path: "/ingest/stripe",
        query: {},
        headers: { "content-type": "application/json" },
        body: "{\"event\":\"invoice.paid\"}",
        replayHistory: [],
      },
    ];

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/health") {
        return makeJson({ status: "ok", events: events.length });
      }

      if (url === "/api/events" && (!init || init.method === undefined)) {
        return makeJson({ items: events });
      }

      if (url === "/api/events" && init?.method === "DELETE") {
        events = [];
        return makeJson({ cleared: true });
      }

      if (url === "/ingest/sample" && init?.method === "POST") {
        events.unshift({
          id: "evt_sample",
          source: "sample",
          createdAt: "2026-02-06T12:02:00.000Z",
          method: "POST",
          path: "/ingest/sample",
          query: {},
          headers: { "content-type": "application/json" },
          body: "{\"type\":\"sample.created\"}",
          replayHistory: [],
        });
        return makeJson({ id: "evt_sample", received: true });
      }

      if (url === "/api/events/evt_sample/replay" && init?.method === "POST") {
        events[0].replayHistory.unshift({
          replayedAt: "2026-02-06T12:03:00.000Z",
          targetUrl: "http://127.0.0.1:8899/ingest/replayed",
          statusCode: 202,
          ok: true,
          durationMs: 12,
        });
        return makeJson({
          replay: {
            replayedAt: "2026-02-06T12:03:00.000Z",
            targetUrl: "http://127.0.0.1:8899/ingest/replayed",
            statusCode: 202,
            ok: true,
            durationMs: 12,
            body: "{\"ok\":true}",
          },
        });
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    document.documentElement.dataset.theme = "light";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and filters events by source", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", { name: /hookwatch/i });
    const eventList = screen.getByRole("list");
    expect(within(eventList).getByText(/^github$/i)).toBeInTheDocument();
    expect(within(eventList).getByText(/^stripe$/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/filter by source/i), "stripe");
    expect(within(eventList).queryByText(/^github$/i)).not.toBeInTheDocument();
    expect(within(eventList).getByText(/^stripe$/i)).toBeInTheDocument();
  });

  it("runs the sample -> replay flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: /send sample/i });
    await user.click(screen.getByRole("button", { name: /send sample/i }));

    const eventList = screen.getByRole("list");
    await waitFor(() => {
      expect(within(eventList).getByText(/^sample$/i)).toBeInTheDocument();
    });

    const sampleLabel = within(eventList).getByText(/^sample$/i);
    const sampleButton = sampleLabel.closest("button");
    expect(sampleButton).not.toBeNull();
    await user.click(sampleButton!);

    await user.click(screen.getByRole("button", { name: /replay event/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/events/evt_sample/replay",
        expect.objectContaining({ method: "POST" })
      );
    });

    expect(screen.getByText(/Replay status 202/i)).toBeInTheDocument();
  });
});
