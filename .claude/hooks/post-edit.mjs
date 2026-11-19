#!/usr/bin/env node
// Hook PostToolUse (Edit|Write|MultiEdit): verificação rápida SÓ no arquivo editado.
// 1) Prettier --write  2) ESLint no arquivo  3) varredura leve de segredos.
// Exit 2 devolve o problema ao Claude para correção. Nunca roda a suíte completa.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// Remove marca de ordem de bytes (alguns shells a adicionam ao stdin).
const BOM_RE = new RegExp("^" + String.fromCharCode(0xfeff));
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8").replace(BOM_RE, "") || "{}");
} catch {
  process.exit(0);
}
const file = input.tool_input?.file_path;
if (!file) process.exit(0);
const abs = isAbsolute(file) ? file : join(root, file);
const rel = relative(root, abs);
if (
  rel.startsWith("..") ||
  /(^|[\\/])(node_modules|\.next|coverage|test-results|playwright-report)[\\/]/.test(rel)
)
  process.exit(0);
if (!existsSync(abs)) process.exit(0);

// Executa os CLIs pelo Node, sem shell (caminhos com espaço/aspas não quebram nem injetam).
const ENTRY = {
  prettier: join(root, "node_modules", "prettier", "bin", "prettier.cjs"),
  eslint: join(root, "node_modules", "eslint", "bin", "eslint.js"),
};
const exec = (name, args) =>
  spawnSync(process.execPath, [ENTRY[name], ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 45_000,
  });

const problems = [];
const ext = extname(abs).toLowerCase();

// Segredos: padrões de alta confiança (o gitleaks completo roda no gate/pre-commit).
const SECRET_PATTERNS = [
  [/\b(AKIA|ASIA)[A-Z2-7]{16}\b/, "chave AWS"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "token GitHub"],
  [/\bsk_live_[A-Za-z0-9]{20,}\b/, "chave Stripe live"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "chave privada"],
  [
    /\beyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/,
    "JWT (possível service_role)",
  ],
];
if (!/\.(png|jpe?g|gif|webp|ico|woff2?)$/i.test(ext) && !rel.includes("__gate_canary")) {
  const text = readFileSync(abs, "utf8");
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text))
      problems.push(
        `Possível ${label} em ${rel}. Remova o valor e use variável de ambiente (.env.local).`,
      );
  }
}

if (
  [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md", ".yml", ".yaml"].includes(
    ext,
  )
) {
  exec("prettier", ["--write", "--log-level", "warn", "--ignore-unknown", abs]);
}

if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
  const r = exec("eslint", ["--max-warnings", "0", "--no-warn-ignored", abs]);
  if (r.status !== 0)
    problems.push(`ESLint em ${rel}:\n${(r.stdout + r.stderr).trim().slice(0, 3000)}`);
}

if (problems.length) {
  console.error(problems.join("\n\n"));
  process.exit(2);
}
process.exit(0);
