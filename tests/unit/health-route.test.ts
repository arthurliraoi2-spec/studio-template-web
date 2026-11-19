import { expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

it("GET /api/health responde ok sem cache", async () => {
  const res = GET();
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ status: "ok" });
});
