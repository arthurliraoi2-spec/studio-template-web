// Verificações estáticas de Supabase e exposição de segredos no frontend.

const IDENT = String.raw`(?:"[^"]+"|[\w$]+)`;
const QUALIFIED = String.raw`(${IDENT}(?:\.${IDENT})?)`;

function normalizeName(raw) {
  const parts = raw.replace(/"/g, "").toLowerCase().split(".");
  return parts.length === 1 ? `public.${parts[0]}` : parts.join(".");
}

/**
 * Analisa migrações SQL (concatenadas em ordem). Retorna problemas encontrados:
 * - tabela criada em schema exposto (public) sem ENABLE ROW LEVEL SECURITY;
 * - RLS habilitado sem nenhuma policy (bloqueia tudo — aviso);
 * - função SECURITY DEFINER sem search_path fixo;
 * - DISABLE ROW LEVEL SECURITY;
 * - GRANT amplo para anon.
 */
export function analyzeMigrations(files) {
  const issues = [];
  const created = new Map();
  const rls = new Set();
  const policies = new Set();

  for (const { path, sql } of files) {
    const clean = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of clean.matchAll(
      new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${QUALIFIED}`, "gi"),
    )) {
      created.set(normalizeName(m[1]), path);
    }
    for (const m of clean.matchAll(
      new RegExp(
        String.raw`alter\s+table\s+(?:only\s+)?${QUALIFIED}\s+enable\s+row\s+level\s+security`,
        "gi",
      ),
    )) {
      rls.add(normalizeName(m[1]));
    }
    for (const m of clean.matchAll(
      new RegExp(
        String.raw`alter\s+table\s+(?:only\s+)?${QUALIFIED}\s+disable\s+row\s+level\s+security`,
        "gi",
      ),
    )) {
      issues.push({
        severity: "high",
        path,
        rule: "rls-disabled",
        detail: `RLS desabilitado em ${normalizeName(m[1])}`,
      });
    }
    for (const m of clean.matchAll(
      new RegExp(String.raw`create\s+policy\s+(?:"[^"]+"|\S+)\s+on\s+${QUALIFIED}`, "gi"),
    )) {
      policies.add(normalizeName(m[1]));
    }
    for (const m of clean.matchAll(
      /create\s+(?:or\s+replace\s+)?function[\s\S]*?(?:\$\$|\$\w+\$)/gi,
    )) {
      const header = m[0];
      if (/security\s+definer/i.test(header) && !/set\s+search_path/i.test(header)) {
        const name = header.match(/function\s+([\w."]+)/i)?.[1] ?? "?";
        issues.push({
          severity: "high",
          path,
          rule: "security-definer-search-path",
          detail: `Função SECURITY DEFINER ${name} sem "set search_path" fixo`,
        });
      }
    }
    if (
      /grant\s+all\s+(?:privileges\s+)?on\s+(?:all\s+tables|table)[\s\S]*?\bto\s+anon\b/i.test(
        clean,
      )
    ) {
      issues.push({
        severity: "high",
        path,
        rule: "grant-all-anon",
        detail: "GRANT ALL para o papel anon",
      });
    }
  }

  for (const [table, path] of created) {
    if (!table.startsWith("public.")) continue;
    if (!rls.has(table)) {
      issues.push({
        severity: "high",
        path,
        rule: "rls-missing",
        detail: `Tabela ${table} sem RLS habilitado`,
      });
    } else if (!policies.has(table)) {
      issues.push({
        severity: "medium",
        path,
        rule: "rls-no-policy",
        detail: `Tabela ${table} com RLS mas sem policies (acesso negado a todos)`,
      });
    }
  }
  return issues;
}

const CLIENT_SECRET_PATTERNS = [
  {
    rule: "service-role-in-client",
    re: /SUPABASE_SERVICE_ROLE|service_role/i,
    detail: "Chave service_role referenciada em código de cliente",
  },
  {
    rule: "public-env-secret",
    re: /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|PASSWORD|TOKEN)/,
    detail: "Segredo exposto via variável NEXT_PUBLIC_",
  },
];

/**
 * Procura uso de chaves privilegiadas em código que vai para o navegador.
 * Considera cliente: arquivos com "use client" ou dentro de pastas components/hooks.
 * NEXT_PUBLIC_* com nome de segredo é sinalizado em qualquer arquivo.
 */
export function findClientSecretUsage(files) {
  const issues = [];
  for (const { path, source } of files) {
    const isClient =
      /^\s*["']use client["']/m.test(source) || /[\\/](components|hooks)[\\/]/.test(path);
    for (const p of CLIENT_SECRET_PATTERNS) {
      if (p.rule === "service-role-in-client" && !isClient) continue;
      if (p.re.test(source))
        issues.push({ severity: "high", path, rule: p.rule, detail: p.detail });
    }
  }
  return issues;
}

/**
 * Arquivos .env reais versionados no git (somente .env.example é permitido).
 * @param {string[]} trackedPaths
 * @returns {{ severity: string, path: string, rule: string, detail: string }[]}
 */
export function findTrackedEnvFiles(trackedPaths) {
  return trackedPaths
    .filter((p) => /(^|[\\/])\.env(\..+)?$/.test(p) && !/\.env\.example$/.test(p))
    .map((path) => ({
      severity: "critical",
      path,
      rule: "env-file-tracked",
      detail: "Arquivo .env versionado",
    }));
}
