import { describe, expect, it } from "vitest";
import { WebhookStore } from "../src/store";

describe("WebhookStore", () => {
  it("filters by source and search", () => {
    const store = new WebhookStore();

    store.add({
      id: "1",
      source: "github",
      createdAt: "2026-02-06T00:00:00.000Z",
      method: "POST",
      path: "/ingest/github",
      query: {},
      headers: {},
      body: "{\"event\":\"push\"}",
      replayHistory: [],
    });

    store.add({
      id: "2",
      source: "stripe",
      createdAt: "2026-02-06T00:00:01.000Z",
      method: "POST",
      path: "/ingest/stripe",
      query: {},
      headers: {},
      body: "{\"event\":\"invoice.paid\"}",
      replayHistory: [],
    });

    expect(store.list({ source: "github" })).toHaveLength(1);
    expect(store.list({ search: "invoice" })).toHaveLength(1);
    expect(store.list({ search: "POST" })).toHaveLength(2);
  });
});
