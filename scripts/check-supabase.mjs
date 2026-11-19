#!/usr/bin/env node
// Verificação estática: RLS nas migrações Supabase, SECURITY DEFINER, chaves
// privilegiadas no cliente e arquivos .env versionados.
//   --root <dir>  analisa outro diretório (usado pelo autoteste)
//   --json        saída em JSON (usada pelo security-gate)
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  analyzeMigrations,
  findClientSecretUsage,
  findTrackedEnvFiles,
} from "./lib/supabase-checks.mjs";

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const asJson = args.includes("--json");

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const migrations = walk(join(root, "supabase", "migrations"), [".sql"])
  .sort()
  .map((p) => ({ path: relative(root, p), sql: readFileSync(p, "utf8") }));
const sources = walk(join(root, "src"), [".ts", ".tsx", ".js", ".jsx", ".mjs"]).map((p) => ({
  path: relative(root, p),
  source: readFileSync(p, "utf8"),
}));

let tracked = [];
if (existsSync(join(root, ".git"))) {
  const r = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  tracked = r.stdout?.split(/\r?\n/).filter(Boolean) ?? [];
}

const issues = [
  ...analyzeMigrations(migrations),
  ...findClientSecretUsage(sources),
  ...findTrackedEnvFiles(tracked),
];
const blocking = issues.some((i) => i.severity === "high" || i.severity === "critical");
const summary = `${migrations.length} migração(ões), ${sources.length} arquivo(s) de código, ${issues.length} problema(s)${migrations.length ? "" : " — projeto sem Supabase (só checagem de chaves no cliente)"}`;

if (asJson) {
  console.log(JSON.stringify({ blocking, summary, issues }));
} else {
  console.log(`Supabase / chaves: ${summary}`);
  for (const i of issues)
    console.log(`  ${i.severity.toUpperCase().padEnd(8)} ${i.rule} ${i.path} — ${i.detail}`);
  console.log(blocking ? "STATUS: BLOQUEADO" : "STATUS: APROVADO");
}
process.exit(blocking ? 1 : 0);
