import { describe, expect, it } from "vitest";
import type { AuthorisedScope } from "@dealership-insights/contracts";
import { InMemoryRepository, makeDemoData } from "./repository.js";

const signal = new AbortController().signal;
const singleSite: AuthorisedScope = {
  principalId: "sydney-central-manager",
  type: "dealership",
  displayName: "Sydney Central",
  dealershipIds: ["d-sydney-central"],
};

describe("scope-enforced repository", () => {
  it("never returns inventory from another dealership", async () => {
    const repository = new InMemoryRepository(makeDemoData());
    const rows = await repository.getInventory(singleSite, { signal, maxRows: 100 });
    expect(rows).not.toHaveLength(0);
    expect(new Set(rows.map((row) => row.dealershipId))).toEqual(new Set(["d-sydney-central"]));
    expect(rows.some((row) => row.vehicleId === "V999")).toBe(false);
  });

  it("keeps only the explicit credential-free demo timestamps current", async () => {
    const current = new Date("2026-07-18T00:00:00.000Z");
    const old = new Date(current.getTime() - 86_400_000);
    const repository = new InMemoryRepository(makeDemoData(old), { keepFresh: true, now: () => current });
    const rows = await repository.getInventory(singleSite, { signal, maxRows: 100 });
    expect(rows[0]?.sourceTime.toISOString()).toBe("2026-07-17T23:59:30.000Z");
    expect(rows[0]?.fetchedAt.toISOString()).toBe(current.toISOString());
  });

  it("reapplies scope when joining valuation and catalogue", async () => {
    const repository = new InMemoryRepository(makeDemoData());
    const ids = ["V001", "V999"];
    const [values, catalogue] = await Promise.all([
      repository.getValuations(singleSite, ids, { signal, maxRows: 100 }),
      repository.getCatalogue(singleSite, ids, { signal, maxRows: 100 }),
    ]);
    expect(values.map((row) => row.vehicleId)).toEqual(["V001"]);
    expect(catalogue.map((row) => row.vehicleId)).toEqual(["V001"]);
  });
});
