import { describe, expect, it } from "vitest";
import { buildServer } from "../src/index";

describe("health endpoint", () => {
  it("returns ok and current event count", async () => {
    const app = buildServer();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", events: 0 });

    await app.close();
  });
});
