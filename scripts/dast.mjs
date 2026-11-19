#!/usr/bin/env node
// Teste dinâmico leve e não destrutivo (DAST). Alvo padrão: servidor local.
// Staging somente com autorização registrada (ver scripts/lib/dast-guard.mjs).
// Volume baixo de requisições; sem fuzzing agressivo, sem exploração ativa.
//
// Uso: DAST_TARGET=http://127.0.0.1:3200 node scripts/dast.mjs
import { checkDastTarget } from "./lib/dast-guard.mjs";
import { finalStatus } from "./lib/policy.mjs";
import { writeReport } from "./lib/report.mjs";

const target = (process.env.DAST_TARGET ?? "http://127.0.0.1:3200").replace(/\/$/, "");
const guard = checkDastTarget(target);
if (!guard.allowed) {
  console.error(`DAST RECUSADO: ${guard.reason}`);
  process.exit(3);
}

const checks = [];
const add = (name, ok, detail = "") =>
  checks.push({ name, status: ok ? "APROVADO" : "REPROVADO", detail });
const get = (path, init) => fetch(`${target}${path}`, { redirect: "manual", ...init });
const json = { "content-type": "application/json" };
const valid = {
  name: "Teste DAST",
  email: "dast@example.com",
  message: "Mensagem de teste automatizado.",
};

try {
  // Cabeçalhos
  const home = await get("/");
  const h = home.headers;
  add("Página inicial responde", home.status === 200, `HTTP ${home.status}`);
  for (const name of [
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "strict-transport-security",
    "permissions-policy",
  ]) {
    add(`Cabeçalho ${name}`, h.has(name), h.get(name)?.slice(0, 80) ?? "ausente");
  }
  const csp = h.get("content-security-policy") ?? "";
  add("CSP sem curinga em script-src", !/script-src[^;]*\*/.test(csp), "");
  add("CSP com frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"), "");
  add("Sem X-Powered-By", !h.has("x-powered-by"), h.get("x-powered-by") ?? "");

  // Arquivos e caminhos sensíveis
  for (const path of [
    "/.env",
    "/.env.local",
    "/.git/config",
    "/package.json",
    "/next.config.ts",
    "/.next/server/app/page.js",
    "/api/../.env",
    "/%2e%2e/.env",
  ]) {
    const r = await get(path);
    const body = r.status === 200 ? await r.text() : "";
    add(
      `Sem exposição de ${path}`,
      r.status !== 200 || !/(SECRET|KEY=|\[core\]|"dependencies")/i.test(body),
      `HTTP ${r.status}`,
    );
  }

  // CORS
  const cors = await get("/api/health", { headers: { origin: "https://evil.example" } });
  const acao = cors.headers.get("access-control-allow-origin");
  add(
    "CORS não reflete origem arbitrária",
    acao !== "https://evil.example" && acao !== "*",
    acao ?? "sem ACAO",
  );

  // API de contato — entradas e métodos
  const m = await get("/api/contact", { method: "GET" });
  add("Método não permitido (GET /api/contact)", m.status === 405, `HTTP ${m.status}`);
  const ct = await get("/api/contact", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "x",
  });
  add("Content-Type inválido recusado", ct.status === 415, `HTTP ${ct.status}`);
  const bad = await get("/api/contact", { method: "POST", headers: json, body: "{nope" });
  add("JSON malformado recusado", bad.status === 400, `HTTP ${bad.status}`);
  const big = await get("/api/contact", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ ...valid, message: "x".repeat(20_000) }),
  });
  add("Payload grande recusado", big.status === 413, `HTTP ${big.status}`);
  const extra = await get("/api/contact", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ ...valid, role: "admin" }),
  });
  add("Campo extra (mass assignment) recusado", extra.status === 422, `HTTP ${extra.status}`);
  const xss = "<script>alert(1)</script>";
  const x = await get("/api/contact", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ ...valid, name: xss }),
  });
  const xBody = await x.text();
  add("Entrada com script não é refletida", !xBody.includes(xss), `HTTP ${x.status}`);
  const csrf = await get("/api/contact", {
    method: "POST",
    headers: { ...json, origin: "https://evil.example" },
    body: JSON.stringify(valid),
  });
  add("POST de origem cruzada recusado (CSRF)", csrf.status === 403, `HTTP ${csrf.status}`);
  const err = await get("/api/contact", { method: "POST", headers: json, body: "{nope" });
  const errBody = await err.text();
  add("Erros sem stack trace", !/at\s+\w+\s+\(|node_modules|\.ts:\d+/.test(errBody), "");

  // Rate limit: poucas requisições a partir de um IP simulado (padrão 5/min)
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) {
    const r = await get("/api/contact", {
      method: "POST",
      headers: { ...json, "x-forwarded-for": "198.51.100.77" },
      body: JSON.stringify(valid),
    });
    limited = r.status === 429;
  }
  add(
    "Rate limit aplicado em /api/contact",
    limited,
    limited ? "429 recebido" : "nenhum 429 em 8 tentativas",
  );
} catch (e) {
  add("Execução do DAST", false, `Falha de conexão com ${target}: ${e.message}`);
}

const status = finalStatus(checks);
const report = writeReport("dast", {
  status,
  checks,
  notes: [`Alvo: ${target} (escopo ${guard.scope})`],
});
console.log(`\nDAST — ${target} (${guard.scope})`);
for (const c of checks)
  console.log(`  ${c.status.padEnd(10)} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
console.log(`\nRelatório: ${report}\nSTATUS: ${status}\n`);
process.exit(status === "APROVADO" ? 0 : 1);
