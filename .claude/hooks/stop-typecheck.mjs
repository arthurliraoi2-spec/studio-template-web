#!/usr/bin/env node
// Hook Stop: typecheck do projeto ao final da resposta, somente se algum arquivo
// TS/TSX mudou desde a última checagem aprovada. Proteção contra loop:
// se o Claude já está continuando por causa deste hook (stop_hook_active), não bloqueia de novo.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// Remove marca de ordem de bytes (alguns shells a adicionam ao stdin).
const BOM_RE = new RegExp("^" + String.fromCharCode(0xfeff));
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8").replace(BOM_RE, "") || "{}");
} catch {
  /* sem entrada */
}
if (input.stop_hook_active) process.exit(0);

const stamp = join(root, ".claude", ".cache", "typecheck-ok");
const last = existsSync(stamp) ? statSync(stamp).mtimeMs : 0;

function changedSince(dir) {
  if (!existsSync(dir)) return false;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (changedSince(p)) return true;
    } else if (/\.(ts|tsx)$/.test(name) && s.mtimeMs > last) return true;
  }
  return false;
}

if (!["src", "tests"].some((d) => changedSince(join(root, d)))) process.exit(0);

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const r = spawnSync(process.execPath, [tsc, "--noEmit", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  timeout: 90_000,
});

if (r.status === 0) {
  mkdirSync(join(root, ".claude", ".cache"), { recursive: true });
  writeFileSync(stamp, new Date().toISOString());
  process.exit(0);
}
console.error(
  `Typecheck falhou — corrija antes de encerrar:\n${(r.stdout + r.stderr).trim().slice(0, 4000)}`,
);
process.exit(2);
