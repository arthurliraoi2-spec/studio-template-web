// Trava de autorização para testes dinâmicos (DAST).
// Local sempre permitido. Staging só com host listado em DAST_ALLOWED_HOSTS,
// rótulo de teste no nome e confirmação explícita DAST_AUTHORIZED=yes.
// Produção nunca.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const TEST_LABEL = /(^|[.-])(staging|stage|dev|test|qa|sandbox|preview)([.-]|$)/i;

/**
 * @param {string} target
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ allowed: boolean, scope?: "local" | "staging", reason?: string }}
 */
export function checkDastTarget(target, env = process.env) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return { allowed: false, reason: `Alvo inválido: ${target}` };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { allowed: false, reason: "Somente http/https." };
  }
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".test")) {
    return { allowed: true, scope: "local" };
  }
  const allowList = (env.DAST_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!allowList.includes(host)) {
    return {
      allowed: false,
      reason: `Host ${host} não está em DAST_ALLOWED_HOSTS (registre a autorização em docs/security/dast-autorizacoes.md).`,
    };
  }
  const label = host.split(".").slice(0, -2).join(".") || host;
  if (!TEST_LABEL.test(label)) {
    return {
      allowed: false,
      reason: `Host ${host} não tem rótulo de ambiente de teste (staging, dev, qa…). Produção nunca é alvo.`,
    };
  }
  if (env.DAST_AUTHORIZED !== "yes") {
    return {
      allowed: false,
      reason: "Defina DAST_AUTHORIZED=yes para confirmar a autorização registrada.",
    };
  }
  return { allowed: true, scope: "staging" };
}
