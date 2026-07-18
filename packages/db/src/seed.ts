import { createDatabase } from "./client.js";
import { catalogue, dealerships, demoPrincipals, inventory, principalDealerships, regions, valuations } from "./schema.js";

const db = createDatabase();
const now = new Date();
const sourceTime = new Date(now.getTime() - 30_000);
const regionRows = [
  { id: "r-nsw", name: "New South Wales", code: "NSW" },
  { id: "r-vic", name: "Victoria", code: "VIC" },
  { id: "r-qld", name: "Queensland", code: "QLD" },
  { id: "r-sa", name: "South Australia", code: "SA" },
  { id: "r-wa", name: "Western Australia", code: "WA" },
];
await db.insert(regions).values(regionRows).onConflictDoUpdate({ target: regions.id, set: { name: regions.name, code: regions.code } });

const specialNames = new Map([[0, "Sydney Central"], [1, "Newcastle"], [2, "Parramatta"], [10, "Melbourne Central"]]);
const dealershipRows = Array.from({ length: 50 }, (_, index) => ({
  id: `d-${String(index + 1).padStart(2, "0")}`,
  name: specialNames.get(index) ?? `Demo Dealership ${String(index + 1).padStart(2, "0")}`,
  regionId: regionRows[Math.floor(index / 10)]!.id,
}));
await db.insert(dealerships).values(dealershipRows).onConflictDoUpdate({ target: dealerships.id, set: { name: dealerships.name, regionId: dealerships.regionId } });

const principalRows = [
  { id: "head-office-analyst", name: "Head office analyst", description: "All 50 demo sites", active: true },
  { id: "nsw-regional-manager", name: "NSW regional manager", description: "The 10 NSW demo sites", active: true },
  { id: "sydney-central-manager", name: "Sydney Central manager", description: "Sydney Central only", active: true },
];
await db.insert(demoPrincipals).values(principalRows).onConflictDoUpdate({ target: demoPrincipals.id, set: { name: demoPrincipals.name, description: demoPrincipals.description, active: true } });
const grants = [
  ...dealershipRows.map((site) => ({ principalId: "head-office-analyst", dealershipId: site.id })),
  ...dealershipRows.slice(0, 10).map((site) => ({ principalId: "nsw-regional-manager", dealershipId: site.id })),
  { principalId: "sydney-central-manager", dealershipId: dealershipRows[0]!.id },
];
await db.insert(principalDealerships).values(grants).onConflictDoNothing();

const makes = [["Toyota", "RAV4"], ["Toyota", "Corolla"], ["Ford", "Ranger"], ["Mazda", "CX-5"], ["Hyundai", "Tucson"]] as const;
const total = 50_000;
const chunkSize = 1_000;
for (let offset = 0; offset < total; offset += chunkSize) {
  const count = Math.min(chunkSize, total - offset);
  const inv = Array.from({ length: count }, (_, local) => {
    const index = offset + local;
    return {
      vehicleId: `V${String(index + 1).padStart(6, "0")}`,
      dealershipId: dealershipRows[index % 50]!.id,
      status: "active",
      priceCents: 2_500_000 + (index % 80) * 50_000,
      stockedAt: new Date(now.getTime() - (10 + (index % 141)) * 86_400_000),
      salesperson: `Demo salesperson ${(index % 12) + 1}`,
      sourceTime,
      fetchedAt: now,
    };
  });
  await db.insert(inventory).values(inv).onConflictDoUpdate({ target: inventory.vehicleId, set: { sourceTime, fetchedAt: now, status: "active" } });
  await db.insert(valuations).values(inv.map((row, local) => ({
    vehicleId: row.vehicleId,
    marketValueCents: offset + local === 41 ? 0 : Math.round(row.priceCents / (0.85 + ((offset + local) % 31) / 100)),
    segment: "demo",
    sourceTime,
    fetchedAt: now,
  }))).onConflictDoUpdate({ target: valuations.vehicleId, set: { sourceTime, fetchedAt: now } });
  const cat = inv.flatMap((row, local) => {
    const index = offset + local;
    if (index % 997 === 0) return [];
    const [make, model] = makes[index % makes.length]!;
    return [{ vehicleId: row.vehicleId, make, model, badge: "Demo", series: "POC", specifications: { fuel: index % 3 === 0 ? "hybrid" : "petrol" }, sourceVersion: "demo-v1", sourceTime, fetchedAt: now }];
  });
  if (cat.length) await db.insert(catalogue).values(cat).onConflictDoUpdate({ target: catalogue.vehicleId, set: { sourceVersion: "demo-v1", sourceTime, fetchedAt: now } });
  console.log(`Seeded ${Math.min(offset + chunkSize, total)}/${total} vehicles`);
}
console.log("Seed complete: 5 regions, 50 dealerships, 3 principals, 50,000 inventory rows.");

