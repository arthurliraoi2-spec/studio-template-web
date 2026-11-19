/** Utilitários HTTP compartilhados pelos Route Handlers. */

export function jsonError(status: number, code: string, message: string, headers?: HeadersInit) {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Proteção CSRF para endpoints que mudam estado: exige que o Origin (quando presente)
 * corresponda ao host da requisição. Navegadores sempre enviam Origin em POST cross-site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // clientes não-navegador; a validação de conteúdo continua valendo
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** IP do cliente para rate limiting. Confie em x-forwarded-for apenas atrás de proxy conhecido. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
