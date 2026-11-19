import { beforeEach, describe, expect, it, vi } from "vitest";

type RouteModule = typeof import("@/app/api/contact/route");
let POST: RouteModule["POST"];

const valid = { name: "Ana Souza", email: "ana@example.com", message: "Gostaria de um orçamento." };

function req(body: unknown, init: { headers?: Record<string, string>; raw?: string } = {}) {
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { host: "localhost:3000", "content-type": "application/json", ...init.headers },
    body: init.raw ?? JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("CONTACT_RATE_LIMIT", "3");
  vi.spyOn(console, "info").mockImplementation(() => {});
  ({ POST } = await import("@/app/api/contact/route"));
});

describe("POST /api/contact", () => {
  it("aceita envio válido (202) sem registrar dados pessoais", async () => {
    const res = await POST(req(valid));
    expect(res.status).toBe(202);
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).not.toContain("ana@example.com");
  });

  it("rejeita origem cruzada (CSRF) com 403", async () => {
    const res = await POST(req(valid, { headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
  });

  it("aceita mesma origem", async () => {
    const res = await POST(req(valid, { headers: { origin: "http://localhost:3000" } }));
    expect(res.status).toBe(202);
  });

  it("rejeita Origin malformado", async () => {
    const res = await POST(req(valid, { headers: { origin: "::::" } }));
    expect(res.status).toBe(403);
  });

  it("exige application/json (415)", async () => {
    const res = await POST(req(valid, { headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
  });

  it("rejeita JSON inválido (400)", async () => {
    const res = await POST(req(null, { raw: "{nope" }));
    expect(res.status).toBe(400);
  });

  it("rejeita payload acima do limite (413)", async () => {
    const res = await POST(req({ ...valid, message: "x".repeat(9000) }));
    expect(res.status).toBe(413);
  });

  it("rejeita content-length declarado acima do limite (413)", async () => {
    const res = await POST(req(valid, { headers: { "content-length": "999999" } }));
    expect(res.status).toBe(413);
  });

  it("retorna erros de validação por campo (422)", async () => {
    const res = await POST(req({ ...valid, email: "x" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.fields[0].path).toBe("email");
  });

  it("honeypot vazio é aceito; preenchido falha na validação", async () => {
    expect((await POST(req({ ...valid, website: "" }))).status).toBe(202);
    expect((await POST(req({ ...valid, website: "bot" }))).status).toBe(422);
  });

  it("aplica rate limit por IP (429 com Retry-After)", async () => {
    const h = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 3; i++) expect((await POST(req(valid, { headers: h }))).status).toBe(202);
    const res = await POST(req(valid, { headers: h }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
