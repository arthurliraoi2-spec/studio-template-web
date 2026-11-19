#!/usr/bin/env node
// Varre só os arquivos staged com gitleaks (usado por .githooks/pre-commit).
// Ferramenta ausente bloqueia o commit: verificação obrigatória não pode ser pulada.
import { findTool, run } from "./lib/tools.mjs";

const bin = findTool("gitleaks");
if (!bin) {
  console.error(
    "pre-commit: gitleaks não encontrado — instale (docs/security/procedimentos.md). Commit bloqueado.",
  );
  process.exit(1);
}
const r = run(bin, [
  "git",
  "--pre-commit",
  "--staged",
  "--config",
  ".gitleaks.toml",
  "--redact",
  "--no-banner",
]);
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
if (r.status !== 0)
  console.error("pre-commit: possível segredo nos arquivos staged. Commit bloqueado.");
process.exit(r.status);
