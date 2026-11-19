#!/usr/bin/env node
// Autoteste dos gates: planta uma falha controlada por vez, confirma que o gate
// correspondente BLOQUEIA (código ≠ 0) e remove a falha. Nada sai da máquina/runner;
// nenhum serviço externo é tocado. Os arquivos-canário são sempre removidos no finally.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReport } from "./lib/report.mjs";

const isWin = process.platform === "win32";
const node = (args, env = {}) =>
  spawnSync(process.execPath, args, {
    encoding: "utf8",
    env: { ...process.env, SECURITY_REPORT: "off", ...env },
  });
const npx = (args) =>
  spawnSync(isWin ? "npx.cmd" : "npx", args, { encoding: "utf8", shell: isWin });
const npm = (args) =>
  spawnSync(isWin ? "npm.cmd" : "npm", args, { encoding: "utf8", shell: isWin });

// Segredos falsos gerados em tempo de execução: este arquivo não contém nenhum literal detectável.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const rand = (n, alphabet) =>
  [...randomBytes(n)].map((b) => alphabet[b % alphabet.length]).join("");
const fakeAwsKey = () => "AKI" + "A" + rand(16, B32);
const fakeGithubToken = () =>
  "gh" + "p_" + rand(36, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");

function withFiles(files, fn) {
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
    return fn();
  } finally {
    for (const path of Object.keys(files)) rmSync(path, { force: true });
  }
}

const scenarios = [
  {
    name: "Erro de tipagem bloqueia typecheck",
    run: () =>
      withFiles({ "src/__gate_canary__.ts": 'export const n: number = "texto";\n' }, () =>
        npx(["tsc", "--noEmit"]),
      ),
  },
  {
    name: "Código inseguro (eval) bloqueia lint",
    run: () =>
      withFiles({ "src/__gate_canary__.ts": 'export const r = eval("1 + 1");\n' }, () =>
        npx(["eslint", "src/__gate_canary__.ts", "--max-warnings", "0"]),
      ),
  },
  {
    name: "Teste unitário falhando bloqueia a suíte",
    run: () =>
      withFiles(
        {
          "tests/unit/__gate_canary__.test.ts":
            'import { expect, it } from "vitest";\nit("canário", () => expect(1).toBe(2));\n',
        },
        () => npx(["vitest", "run", "tests/unit/__gate_canary__.test.ts"]),
      ),
  },
  {
    name: "Segredo exposto bloqueia gate de segurança (gitleaks)",
    run: () =>
      withFiles(
        {
          "src/__gate_canary_secret__.ts": `export const aws = "${fakeAwsKey()}";\nexport const gh = "${fakeGithubToken()}";\n`,
        },
        () => node(["scripts/security-gate.mjs", "--only", "secrets"]),
      ),
  },
  {
    name: "Padrão inseguro bloqueia SAST (Semgrep)",
    run: () =>
      withFiles(
        {
          "src/app/__gate_canary_sast__.tsx":
            '"use client";\nexport function C({ html }: { html: string }) {\n  return <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\n',
        },
        () => node(["scripts/security-gate.mjs", "--only", "sast"]),
      ),
  },
  {
    name: "Dependência com vulnerabilidade crítica bloqueia gate (npm audit simulado)",
    run: () => {
      const dir = mkdtempSync(join(tmpdir(), "gate-audit-"));
      const fixture = join(dir, "audit.json");
      writeFileSync(
        fixture,
        JSON.stringify({
          vulnerabilities: {
            "pacote-canario": {
              severity: "critical",
              via: [
                {
                  source: 1,
                  severity: "critical",
                  title: "Canário",
                  url: "https://github.com/advisories/GHSA-0000-0000-0000",
                },
              ],
            },
          },
        }),
      );
      try {
        return node(["scripts/security-gate.mjs", "--only", "deps", "--audit-fixture", fixture]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "Tabela Supabase sem RLS bloqueia verificação",
    run: () => {
      const dir = mkdtempSync(join(tmpdir(), "gate-rls-"));
      try {
        mkdirSync(join(dir, "supabase", "migrations"), { recursive: true });
        writeFileSync(
          join(dir, "supabase", "migrations", "0001_canary.sql"),
          "create table public.canario (id uuid primary key);\n",
        );
        return node(["scripts/check-supabase.mjs", "--root", dir]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "DAST recusa alvo externo não autorizado (sem enviar requisição)",
    run: () =>
      node(["scripts/dast.mjs"], {
        DAST_TARGET: "https://example.com",
        DAST_ALLOWED_HOSTS: "",
        DAST_AUTHORIZED: "",
      }),
  },
  {
    name: "Pipeline (verify:quick) bloqueia entrega com falha",
    run: () =>
      withFiles({ "src/__gate_canary__.ts": 'export const n: number = "texto";\n' }, () =>
        npm(["run", "verify:quick"]),
      ),
  },
];

const checks = [];
for (const s of scenarios) {
  process.stdout.write(`• ${s.name} … `);
  const r = s.run();
  const blocked = (r.status ?? 1) !== 0;
  console.log(blocked ? `BLOQUEOU (código ${r.status})` : "NÃO BLOQUEOU ✗");
  if (!blocked) console.log((r.stdout ?? "").slice(-1500), (r.stderr ?? "").slice(-1500));
  checks.push({
    name: s.name,
    status: blocked ? "APROVADO" : "REPROVADO",
    detail: `código ${r.status}`,
  });
}

const leftovers = [
  "src/__gate_canary__.ts",
  "src/__gate_canary_secret__.ts",
  "src/app/__gate_canary_sast__.tsx",
  "tests/unit/__gate_canary__.test.ts",
].filter(existsSync);
if (leftovers.length) {
  checks.push({ name: "Limpeza dos canários", status: "REPROVADO", detail: leftovers.join(", ") });
}

const status = checks.every((c) => c.status === "APROVADO") ? "APROVADO" : "BLOQUEADO";
const report = writeReport("gate-selftest", {
  status,
  checks,
  notes: ["Cada cenário deve terminar com código ≠ 0 (falha detectada e entrega bloqueada)."],
});
console.log(
  `\nRelatório: ${report}\nAUTOTESTE DOS GATES: ${status === "APROVADO" ? "todos os gates bloquearam as falhas controladas" : "ALGUM GATE NÃO BLOQUEOU"}\n`,
);
process.exit(status === "APROVADO" ? 0 : 1);
