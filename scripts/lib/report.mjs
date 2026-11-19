// Grava relatórios versionáveis em docs/security/reports e atualiza o histórico.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.cwd();
export const SECURITY_DIR = join(ROOT, "docs", "security");
const REPORTS = join(SECURITY_DIR, "reports");
const HISTORY = join(SECURITY_DIR, "historico-auditorias.md");

export function timestamp(d = new Date()) {
  return d.toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
}

export function writeReport(kind, { status, checks, findings = [], notes = [] }) {
  if (process.env.SECURITY_REPORT === "off") return null;
  mkdirSync(REPORTS, { recursive: true });
  const ts = timestamp();
  const base = join(REPORTS, `${ts}-${kind}`);
  const env = process.env.CI ? "CI" : "local";
  writeFileSync(
    `${base}.json`,
    JSON.stringify(
      { kind, status, env, at: new Date().toISOString(), checks, findings, notes },
      null,
      2,
    ),
  );

  const lines = [
    `# Relatório ${kind} — ${ts}`,
    "",
    `- Ambiente: ${env}`,
    `- Status final: **${status}**`,
    "",
    "| Verificação | Status | Detalhe |",
    "| --- | --- | --- |",
    ...checks.map(
      (c) =>
        `| ${c.name} | ${c.status} | ${(c.detail ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")} |`,
    ),
  ];
  if (findings.length) {
    lines.push(
      "",
      "## Achados",
      "",
      "| Ferramenta | Severidade | Id | Local | Situação |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const f of findings) {
      lines.push(`| ${f.tool} | ${f.severity} | ${f.id} | ${f.package ?? ""} | ${f.state} |`);
    }
  }
  if (notes.length) lines.push("", "## Observações", "", ...notes.map((n) => `- ${n}`));
  writeFileSync(`${base}.md`, lines.join("\n") + "\n");

  if (!existsSync(HISTORY)) {
    writeFileSync(
      HISTORY,
      "# Histórico de auditorias\n\n| Data (UTC) | Tipo | Ambiente | Status | Relatório |\n| --- | --- | --- | --- | --- |\n",
    );
  }
  appendFileSync(
    HISTORY,
    `| ${new Date().toISOString().slice(0, 16).replace("T", " ")} | ${kind} | ${env} | ${status} | [${ts}-${kind}](reports/${ts}-${kind}.md) |\n`,
  );
  return `${base}.md`;
}
