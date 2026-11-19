import { CONTACT_MAX_BODY_BYTES, contactSchema } from "@/lib/contact-schema";
import { clientKey, isSameOrigin, jsonError } from "@/lib/http";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter({
  limit: Number(process.env.CONTACT_RATE_LIMIT ?? 5),
  windowMs: 60_000,
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, "forbidden_origin", "Origem não permitida.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonError(415, "unsupported_media_type", "Envie application/json.");
  }

  const rate = limiter.check(clientKey(request));
  if (!rate.allowed) {
    return jsonError(429, "rate_limited", "Muitas tentativas. Tente novamente em instantes.", {
      "Retry-After": String(rate.retryAfterSeconds),
    });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > CONTACT_MAX_BODY_BYTES) {
    return jsonError(413, "payload_too_large", "Conteúdo muito grande.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonError(400, "invalid_body", "Corpo da requisição inválido.");
  }
  if (new TextEncoder().encode(raw).byteLength > CONTACT_MAX_BODY_BYTES) {
    return jsonError(413, "payload_too_large", "Conteúdo muito grande.");
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonError(400, "invalid_json", "JSON inválido.");
  }

  const parsed = contactSchema.safeParse(data);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "validation_failed",
          message: "Verifique os campos destacados.",
          fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }

  if (parsed.data.website) {
    // Honeypot preenchido: responde sucesso sem processar (não informa o bot).
    return Response.json({ ok: true }, { status: 202 });
  }

  // Integração real (e-mail, CRM, banco) entra aqui. Nunca registre o conteúdo pessoal em logs.
  console.info(JSON.stringify({ event: "contact.accepted", at: new Date().toISOString() }));

  return Response.json({ ok: true }, { status: 202 });
}
