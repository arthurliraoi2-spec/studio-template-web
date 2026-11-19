#!/usr/bin/env node
// Pipeline obrigatório de entrega (MASTER SYSTEM §7–§8).
//   npm run verify         → suíte completa (gate de liberação)
//   npm run verify:quick   → checagens rápidas durante o desenvolvimento
// Sai com código 1 se qualquer etapa obrigatória falhar ou não for executada.
import { spawnSync } from "node:child_process";
import { finalStatus } from "./lib/policy.mjs";
import { writeReport } from "./lib/report.mjs";
import { startLocalServer } from "./lib/server.mjs";

const quick = process.argv.includes("--quick");
const isWin = process.platform === "win32";

const npm =
  (script, extra = []) =>
  () => {
    const r = spawnSync(isWin ? "npm.cmd" : "npm", ["run", script, "--", ...extra], {
      stdio: "inherit",
      shell: isWin,
    });
    return r.status === 0;
  };

const steps = [
  { name: "Formatação (Prettier)", run: npm("format:check") },
  { name: "Lint (ESLint + security)", run: npm("lint") },
  { name: "Tipagem (tsc)", run: npm("typecheck") },
  {
    name: quick ? "Testes unitários" : "Testes unitários + cobertura",
    run: quick ? npm("test") : npm("test:coverage"),
  },
];
if (!quick) {
  steps.push(
    { name: "Build de produção", run: npm("build") },
    { name: "E2E + visual + acessibilidade (mobile/tablet/desktop)", run: npm("test:e2e") },
    { name: "Gate de segurança (deps, SAST, segredos, Supabase)", run: npm("security") },
    {
      name: "DAST local (servidor de produção em 127.0.0.1)",
      run: async () => {
        const server = await startLocalServer(3200);
        try {
          const r = spawnSync(process.execPath, ["scripts/dast.mjs"], {
            stdio: "inherit",
            env: { ...process.env, DAST_TARGET: server.url },
          });
          return r.status === 0;
        } finally {
          server.stop();
        }
      },
    },
  );
}

const results = [];
let failed = false;
for (const step of steps) {
  if (failed && !quick) {
    // Após uma falha, as etapas seguintes ficam registradas como não executadas (fail fast).
    results.push({
      name: step.name,
      status: "NÃO EXECUTADO",
      detail: "interrompido por falha anterior",
    });
    continue;
  }
  console.log(`\n▶ ${step.name}`);
  const started = Date.now();
  let ok = false;
  try {
    ok = await step.run();
  } catch (e) {
    console.error(e);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ name: step.name, status: ok ? "APROVADO" : "REPROVADO", detail: `${secs}s` });
  if (!ok) failed = true;
}

const status = finalStatus(results);
const report = quick ? null : writeReport("verify", { status, checks: results });
console.log(`\n${quick ? "VERIFICAÇÃO RÁPIDA" : "PIPELINE DE ENTREGA"}`);
for (const r of results) console.log(`  ${r.status.padEnd(14)} ${r.name} (${r.detail})`);
if (report) console.log(`\nRelatório: ${report}`);
console.log(`STATUS FINAL: ${status}\n`);
process.exit(status === "APROVADO" ? 0 : 1);
