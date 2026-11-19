import { describe, expect, it } from "vitest";
import {
  evaluateGitleaks,
  evaluateNpmAudit,
  evaluateOsv,
  evaluateSemgrep,
  finalStatus,
  partitionExceptions,
} from "../../scripts/lib/policy.mjs";

const audit = (severity: string, ghsa = "GHSA-aaaa-bbbb-cccc") => ({
  vulnerabilities: {
    pacote: {
      severity,
      fixAvailable: true,
      via: [{ source: 1, title: "Falha", severity, url: `https://github.com/advisories/${ghsa}` }],
    },
    dependente: { severity, via: ["pacote"] },
  },
});

const exc = (over: Record<string, string> = {}) => ({
  id: "GHSA-aaaa-bbbb-cccc",
  tool: "npm-audit",
  reason: "Não aplicável: código vulnerável não é importado",
  approvedBy: "Responsável técnico",
  expires: "2099-01-01",
  ...over,
});

describe("política de dependências (npm audit)", () => {
  it.each(["critical", "high"])("%s bloqueia", (sev) => {
    expect(evaluateNpmAudit(audit(sev)).blocking).toHaveLength(1);
  });

  it.each(["moderate", "low"])("%s apenas registra", (sev) => {
    const r = evaluateNpmAudit(audit(sev));
    expect(r.blocking).toHaveLength(0);
    expect(r.informational).toHaveLength(1);
  });

  it("exceção ativa transforma bloqueio em tolerado", () => {
    const r = evaluateNpmAudit(audit("critical"), [exc()]);
    expect(r.blocking).toHaveLength(0);
    expect(r.tolerated).toHaveLength(1);
  });

  it("relatório vazio passa", () => {
    expect(evaluateNpmAudit({}).blocking).toHaveLength(0);
  });
});

describe("exceções", () => {
  it("separa ativas, vencidas e inválidas", () => {
    const now = new Date("2026-06-01");
    const r = partitionExceptions(
      [
        exc(),
        exc({ expires: "2026-01-01" }),
        { id: "x", tool: "npm-audit" },
        exc({ expires: "nope" }),
      ],
      now,
    );
    expect(r.active).toHaveLength(1);
    expect(r.expired).toHaveLength(1);
    expect(r.invalid).toHaveLength(2);
  });
});

describe("OSV, Semgrep e gitleaks", () => {
  it("OSV converte CVSS em severidade", () => {
    const mk = (s: string) => ({
      results: [
        {
          packages: [
            {
              package: { name: "p", version: "1" },
              groups: [{ ids: ["GHSA-1"], max_severity: s }],
            },
          ],
        },
      ],
    });
    expect(evaluateOsv(mk("9.8")).blocking[0].severity).toBe("critical");
    expect(evaluateOsv(mk("7.0")).blocking[0].severity).toBe("high");
    expect(evaluateOsv(mk("5.0")).informational[0].severity).toBe("medium");
    expect(evaluateOsv(mk("2.0")).informational[0].severity).toBe("low");
    expect(evaluateOsv(mk("")).informational[0].severity).toBe("unknown");
  });

  it("Semgrep: ERROR bloqueia, WARNING registra, exceção por regra+arquivo", () => {
    const rep = {
      results: [
        {
          check_id: "r1",
          path: "src/a.ts",
          start: { line: 1 },
          extra: { severity: "ERROR", message: "m" },
        },
        {
          check_id: "r2",
          path: "src/b.ts",
          start: { line: 2 },
          extra: { severity: "WARNING", message: "m" },
        },
        {
          check_id: "r3",
          path: "src/c.ts",
          start: { line: 3 },
          extra: { severity: "INFO", message: "m" },
        },
      ],
    };
    const r = evaluateSemgrep(rep);
    expect(r.blocking).toHaveLength(1);
    expect(r.informational).toHaveLength(2);
    const withExc = evaluateSemgrep(rep, [exc({ id: "r1:src/a.ts", tool: "semgrep" })]);
    expect(withExc.blocking).toHaveLength(0);
  });

  it("gitleaks: qualquer segredo bloqueia", () => {
    expect(evaluateGitleaks([{ RuleID: "aws", File: "a", StartLine: 1 }]).blocking).toHaveLength(1);
    expect(evaluateGitleaks([]).blocking).toHaveLength(0);
  });
});

describe("status final", () => {
  it("segue APROVADO / PENDENTE / BLOQUEADO", () => {
    expect(finalStatus([{ status: "APROVADO" }])).toBe("APROVADO");
    expect(finalStatus([{ status: "APROVADO" }, { status: "NÃO EXECUTADO" }])).toBe("PENDENTE");
    expect(finalStatus([{ status: "NÃO EXECUTADO" }, { status: "REPROVADO" }])).toBe("BLOQUEADO");
  });
});
