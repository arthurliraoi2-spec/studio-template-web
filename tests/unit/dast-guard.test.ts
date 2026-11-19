import { describe, expect, it } from "vitest";
import { checkDastTarget } from "../../scripts/lib/dast-guard.mjs";

describe("checkDastTarget — autorização de testes dinâmicos", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3200",
    "http://[::1]:3000",
    "http://app.localhost",
    "http://loja.test",
  ])("permite alvo local %s", (url) => expect(checkDastTarget(url, {}).allowed).toBe(true));

  it("recusa host externo não listado", () => {
    const r = checkDastTarget("https://example.com", {});
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("DAST_ALLOWED_HOSTS");
  });

  it("recusa host listado sem rótulo de teste (produção)", () => {
    const env = { DAST_ALLOWED_HOSTS: "www.cliente.com.br", DAST_AUTHORIZED: "yes" };
    expect(checkDastTarget("https://www.cliente.com.br", env).allowed).toBe(false);
  });

  it("exige confirmação explícita para staging", () => {
    const env = { DAST_ALLOWED_HOSTS: "staging.cliente.com.br" };
    expect(checkDastTarget("https://staging.cliente.com.br", env).allowed).toBe(false);
    expect(
      checkDastTarget("https://staging.cliente.com.br", { ...env, DAST_AUTHORIZED: "yes" }),
    ).toEqual({ allowed: true, scope: "staging" });
  });

  it("recusa protocolos e URLs inválidos", () => {
    expect(checkDastTarget("file:///etc/passwd", {}).allowed).toBe(false);
    expect(checkDastTarget("nao e url", {}).allowed).toBe(false);
  });
});
