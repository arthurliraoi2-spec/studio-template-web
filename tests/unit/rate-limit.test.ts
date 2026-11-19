import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("bloqueia acima do limite e libera após a janela", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    const blocked = rl.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rl.check("b").allowed).toBe(true); // chaves isoladas
    t = 1000;
    expect(rl.check("a").allowed).toBe(true);
  });

  it("limita o número de chaves em memória", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 10, now: () => t, maxKeys: 2 });
    rl.check("a");
    rl.check("b");
    rl.check("c"); // força despejo da mais antiga
    expect(rl.check("a").allowed).toBe(true); // "a" foi despejada, recomeça
    t = 100;
    rl.check("x");
    rl.check("y"); // janelas expiradas são limpas
    expect(rl.check("x").allowed).toBe(false);
  });
});
