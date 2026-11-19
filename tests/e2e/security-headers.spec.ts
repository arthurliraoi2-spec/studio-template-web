import { expect, test } from "@playwright/test";

test.describe("Cabeçalhos de segurança", () => {
  test("presentes na página e na API", async ({ request }) => {
    for (const path of ["/", "/api/health"]) {
      const res = await request.get(path);
      const h = res.headers();
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["content-security-policy"], path).toContain("object-src 'none'");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["referrer-policy"], path).toBeTruthy();
      expect(h["strict-transport-security"], path).toContain("max-age=");
      expect(h["x-powered-by"], path).toBeUndefined();
    }
  });

  test("API rejeita origem cruzada e não reflete CORS", async ({ request }) => {
    const res = await request.post("/api/contact", {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: { name: "Ana", email: "a@example.com", message: "mensagem de teste" },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
  });
});
