import { describe, expect, it } from "bun:test";
import app from "./index";

describe("server", () => {
  it("GET / serves the dashboard", async () => {
    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("recon-agent");
  });
  it("GET /api/report returns json", async () => {
    const res = await app.fetch(new Request("http://localhost/api/report"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("history");
  });
});
