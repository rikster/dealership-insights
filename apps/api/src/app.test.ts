import { afterEach, describe, expect, it } from "vitest";
import { InMemoryRepository, makeDemoData } from "@autograb/db";
import { MockModelGateway } from "@autograb/orchestrator";
import { buildApp } from "./app.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("operational endpoints", () => {
  it("reports healthy", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "autograb-api" });
  });

  it("reports credential-free readiness", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ready" });
  });
});

describe("public API", () => {
  function api() {
    const repository = new InMemoryRepository(makeDemoData());
    const app = buildApp({ repository, model: new MockModelGateway() });
    apps.push(app);
    return { app, repository };
  }

  it("lists clearly labelled demo principals and scenarios", async () => {
    const { app } = api();
    const [principals, scenarios] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/demo/principals" }),
      app.inject({ method: "GET", url: "/v1/demo/scenarios" }),
    ]);
    expect(principals.statusCode).toBe(200);
    expect(principals.json()).toHaveLength(3);
    expect(scenarios.json()).toContainEqual(expect.objectContaining({ id: "stale-inventory", production: false }));
    expect(scenarios.json()).toContainEqual(expect.objectContaining({ id: "forbidden-site", production: false }));
  });

  it.each([
    ["answered", "Which vehicles at Sydney Central have been in stock over 60 days?", "normal"],
    ["needs_clarification", "Which vehicles are old?", "normal"],
    ["refused", "What is salesperson conversion at Sydney Central?", "normal"],
    ["refused", "Which vehicles at Sydney Central have been in stock over 60 days?", "stale-inventory"],
    ["refused", "Which vehicles at Sydney Central are more than 10% above market?", "stale-valuation"],
    ["refused", "Which vehicles at Sydney Central have been in stock over 60 days?", "forbidden-site"],
  ])("returns structured %s application status", async (status, question, scenario) => {
    const { app } = api();
    const response = await app.inject({ method: "POST", url: "/v1/query", payload: { question, principalId: "head-office-analyst", scenario } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status, budgets: { sourceCallsMax: 6, plannerAttemptsMax: 2 } });
  });

  it("uses a transport 400 with safe Zod issues for invalid input", async () => {
    const { app } = api();
    const response = await app.inject({ method: "POST", url: "/v1/query", payload: { question: "", principalId: "", scenario: "production" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ status: "failed", message: "Invalid query request." });
    expect(response.json().issues.length).toBeGreaterThan(0);
  });

  it("does not leak internals from unexpected route failures", async () => {
    const repository = new InMemoryRepository(makeDemoData());
    repository.listPrincipals = async () => { throw new Error("secret database detail"); };
    const app = buildApp({ repository, model: new MockModelGateway() });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/demo/principals" });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("secret database detail");
    expect(response.json().message).toBe("The API could not complete the request.");
  });

  it("permits configured CORS and rejects an unlisted browser origin", async () => {
    const { app } = api();
    const allowed = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:3000" } });
    const blocked = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://untrusted.example" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
