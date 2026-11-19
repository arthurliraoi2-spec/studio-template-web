#!/usr/bin/env node
// Hook PreToolUse (Bash): pede confirmação do usuário antes de comandos de deploy,
// publicação, migração remota ou destrutivos, e bloqueia desvios dos gates.
import { readFileSync } from "node:fs";

// Remove marca de ordem de bytes (alguns shells a adicionam ao stdin).
const BOM_RE = new RegExp("^" + String.fromCharCode(0xfeff));
let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8").replace(BOM_RE, "") || "{}");
} catch {
  process.exit(0);
}
const cmd = String(input.tool_input?.command ?? "");

// Bloqueio: contornar verificações obrigatórias.
const DENY = [
  [/--no-verify\b/, "Não pule os hooks de git (--no-verify). Corrija a falha apontada."],
  [/\bSECURITY_GATE_SKIP\b|--allow-missing.*\bCI=/, "Não desative gates de segurança."],
];
for (const [re, reason] of DENY) {
  if (re.test(cmd)) {
    console.error(reason);
    process.exit(2);
  }
}

// Confirmação: ações externas, irreversíveis ou de produção.
const ASK = [
  [/\b(vercel|netlify)\b.*(--prod|deploy)/, "deploy"],
  [/\bfirebase\s+deploy\b|\bfly\s+deploy\b|\bwrangler\s+(deploy|publish)\b/, "deploy"],
  [/\bnpm\s+publish\b|\bpnpm\s+publish\b/, "publicação de pacote"],
  [
    /\bsupabase\s+(db\s+(push|reset)|migration\s+repair|functions\s+deploy|secrets\s+set)\b/,
    "alteração em Supabase remoto",
  ],
  [/\bgit\s+push\b.*(--force|-f\b|--force-with-lease)/, "push forçado"],
  [/\bgit\s+push\b.*\b(main|master|production)\b/, "push direto em branch principal"],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, "descarte de alterações locais"],
  [/\brm\s+-[a-z]*r[a-z]*f?\b|\bRemove-Item\b.*-Recurse/, "remoção recursiva de arquivos"],
  [/\b(drop\s+(table|database|schema)|truncate\s+table)\b/i, "comando SQL destrutivo"],
  [/\bterraform\s+(apply|destroy)\b/, "infraestrutura"],
];
for (const [re, label] of ASK) {
  if (re.test(cmd)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `MASTER SYSTEM §2/§10: ${label} exige autorização explícita. Confirme que esta ação foi autorizada pelo responsável.`,
        },
      }),
    );
    process.exit(0);
  }
}
process.exit(0);
