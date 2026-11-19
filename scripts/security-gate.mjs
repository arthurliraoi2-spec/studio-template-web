#!/usr/bin/env node
// Gate de segurança: dependências (npm audit + OSV), SAST (Semgrep), segredos (gitleaks)
// e verificações de Supabase. Sai com código 1 se BLOQUEADO ou PENDENTE.
//
// Opções:
//   --only <a,b>          executa só algumas verificações (deps,osv,sast,secrets,supabase)
//   --allow-missing       ferramenta ausente vira aviso (uso local rápido; nunca em CI)
//   --audit-fixture <f>   usa um JSON de npm audit em vez de executar (autoteste do gate)
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateGitleaks,
  evaluateNpmAudit,
  evaluateOsv,
  evaluateSemgrep,
  finalStatus,
  partitionExceptions,
} from "./lib/policy.mjs";
import { ROOT, SECURITY_DIR, writeReport } from "./lib/report.mjs";
import { findTool, run, runNpm } from "./lib/tools.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt("--only")?.split(",");
const allowMissing = args.includes("--allow-missing") && !process.env.CI;
const auditFixture = opt("--audit-fixture");
const enabled = (k) => !only || only.includes(k);

const SEMGREP_CONFIGS = [
  "p/owasp-top-ten",
  "p/typescript",
  "p/javascript",
  "p/react",
  "p/nextjs",
  ".semgrep/rules.yml",
];

const exceptionsFile = join(SECURITY_DIR, "exceptions.json");
const rawExceptions = existsSync(exceptionsFile)
  ? JSON.parse(readFileSync(exceptionsFile, "utf8")).exceptions
  : [];
const { active, expired, invalid } = partitionExceptions(rawExceptions);

const checks = [];
const findings = [];
const notes = [];

if (expired.length || invalid.length) {
  checks.push({
    name: "Exceções",
    status: "REPROVADO",
    detail: `${expired.length} vencida(s), ${invalid.length} inválida(s) em docs/security/exceptions.json`,
  });
}

function record(name, result, extra = "") {
  for (const f of result.blocking) findings.push({ ...f, state: "BLOQUEIA" });
  for (const f of result.tolerated)
    findings.push({ ...f, state: `EXCEÇÃO até ${f.exception.expires}` });
  for (const f of result.informational) findings.push({ ...f, state: "registrado" });
  checks.push({
    name,
    status: result.blocking.length ? "REPROVADO" : "APROVADO",
    detail: `${result.blocking.length} bloqueante(s), ${result.tolerated.length} com exceção, ${result.informational.length} registrado(s)${extra}`,
  });
}

function missing(name, tool) {
  checks.push({
    name,
    status: allowMissing ? "NÃO EXECUTADO (permitido)" : "NÃO EXECUTADO",
    detail: `${tool} não encontrado — ver docs/security/procedimentos.md#ferramentas`,
  });
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Saída inválida de ${label}: ${text.slice(0, 300)}`);
  }
}

// 1. npm audit (dependências de produção e desenvolvimento)
if (enabled("deps")) {
  try {
    const json = auditFixture
      ? readFileSync(auditFixture, "utf8")
      : runNpm(["audit", "--json"]).stdout;
    record("Dependências (npm audit)", evaluateNpmAudit(parseJson(json, "npm audit"), active));
  } catch (e) {
    checks.push({ name: "Dependências (npm audit)", status: "REPROVADO", detail: e.message });
  }
}

// 2. OSV-Scanner (base OSV.dev, complementa o npm audit)
if (enabled("osv") && !auditFixture) {
  const bin = findTool("osv-scanner");
  if (!bin) missing("Dependências (OSV-Scanner)", "osv-scanner");
  else {
    const r = run(bin, ["scan", "source", "--lockfile", "package-lock.json", "--format", "json"]);
    if (r.status > 1 && !r.stdout.trim().startsWith("{")) {
      checks.push({
        name: "Dependências (OSV-Scanner)",
        status: "REPROVADO",
        detail: `erro de execução: ${r.stderr.slice(0, 300)}`,
      });
    } else {
      record("Dependências (OSV-Scanner)", evaluateOsv(parseJson(r.stdout, "osv-scanner"), active));
    }
  }
}

// 3. Semgrep (SAST)
if (enabled("sast") && !auditFixture) {
  const bin = findTool("semgrep");
  if (!bin) missing("SAST (Semgrep)", "semgrep");
  else {
    const targets = ["src", "supabase"].filter((d) => existsSync(join(ROOT, d)));
    const cfg = SEMGREP_CONFIGS.flatMap((c) => ["--config", c]);
    const r = run(bin, ["scan", ...cfg, "--metrics=off", "--quiet", "--json", ...targets]);
    if (!r.stdout.trim().startsWith("{")) {
      checks.push({
        name: "SAST (Semgrep)",
        status: "REPROVADO",
        detail: `erro de execução: ${(r.stderr || r.stdout).slice(0, 300)}`,
      });
    } else {
      const report = parseJson(r.stdout, "semgrep");
      const errors = (report.errors ?? []).filter((e) => e.level === "error");
      const scanned = report.paths?.scanned?.length ?? 0;
      // Sem --error, o Semgrep sai com 0 mesmo com achados; código ≥ 2 = falha de execução
      // (ex. regra inválida). Análise incompleta nunca conta como aprovada.
      if (r.status >= 2 || errors.length) {
        checks.push({
          name: "SAST (Semgrep)",
          status: "REPROVADO",
          detail: `análise incompleta (código ${r.status}): ${(errors[0]?.message ?? r.stderr).slice(0, 250)}`,
        });
      } else {
        record(
          "SAST (Semgrep)",
          evaluateSemgrep(report, active),
          ` — ${scanned} arquivo(s); regras: ${SEMGREP_CONFIGS.join(", ")}`,
        );
      }
    }
  }
}

// 4. gitleaks (segredos no diretório e, se houver git, no histórico)
if (enabled("secrets") && !auditFixture) {
  const bin = findTool("gitleaks");
  if (!bin) missing("Segredos (gitleaks)", "gitleaks");
  else {
    const tmp = mkdtempSync(join(tmpdir(), "gitleaks-"));
    try {
      const all = [];
      const scans = [["dir", "."]];
      if (existsSync(join(ROOT, ".git"))) scans.push(["git", "."]);
      for (const [mode, target] of scans) {
        const out = join(tmp, `${mode}.json`);
        const r = run(bin, [
          mode,
          target,
          "--config",
          ".gitleaks.toml",
          "--no-banner",
          "--redact",
          "--report-format",
          "json",
          "--report-path",
          out,
          "--exit-code",
          "0",
        ]);
        if (r.status !== 0 || !existsSync(out))
          throw new Error(`gitleaks ${mode} falhou: ${r.stderr.slice(0, 300)}`);
        all.push(...JSON.parse(readFileSync(out, "utf8") || "[]"));
      }
      record(
        "Segredos (gitleaks)",
        evaluateGitleaks(all),
        existsSync(join(ROOT, ".git")) ? " — diretório + histórico git" : " — diretório (sem git)",
      );
    } catch (e) {
      checks.push({ name: "Segredos (gitleaks)", status: "REPROVADO", detail: e.message });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// 5. Supabase / exposição de chaves no cliente
if (enabled("supabase") && !auditFixture) {
  const r = run(process.execPath, [join("scripts", "check-supabase.mjs"), "--json"]);
  try {
    const res = JSON.parse(r.stdout);
    for (const i of res.issues)
      findings.push({
        tool: "supabase-check",
        id: i.rule,
        package: i.path,
        severity: i.severity,
        state: ["high", "critical"].includes(i.severity) ? "BLOQUEIA" : "registrado",
      });
    checks.push({
      name: "Supabase / chaves no cliente",
      status: res.blocking ? "REPROVADO" : "APROVADO",
      detail: res.summary,
    });
  } catch {
    checks.push({
      name: "Supabase / chaves no cliente",
      status: "REPROVADO",
      detail: r.stderr.slice(0, 300),
    });
  }
}

const status = finalStatus(
  checks.map((c) => ({
    ...c,
    status: c.status === "NÃO EXECUTADO (permitido)" ? "APROVADO" : c.status,
  })),
);
const reportPath = auditFixture
  ? null
  : writeReport("security", { status, checks, findings, notes });

console.log("\nGATE DE SEGURANÇA");
for (const c of checks) console.log(`  ${c.status.padEnd(26)} ${c.name} — ${c.detail}`);
for (const f of findings.filter((x) => x.state === "BLOQUEIA")) {
  console.log(`  ✗ [${f.tool}] ${f.severity} ${f.id} ${f.package ?? ""} ${f.title ?? ""}`);
}
if (reportPath) console.log(`\nRelatório: ${reportPath}`);
console.log(`STATUS: ${status}\n`);
process.exit(status === "APROVADO" ? 0 : 1);
