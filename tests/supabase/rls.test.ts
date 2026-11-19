/**
 * Testes de autenticação, autorização e RLS contra um projeto Supabase de TESTE.
 *
 * Executam somente quando as variáveis abaixo existem (ver .env.example) e o host é
 * local (supabase start) ou staging autorizado. Nunca use produção nem credenciais reais.
 *
 *   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY
 *   SUPABASE_TEST_USER_A_EMAIL / _PASSWORD, SUPABASE_TEST_USER_B_EMAIL / _PASSWORD
 *   SUPABASE_RLS_TABLE (tabela com coluna de dono), SUPABASE_RLS_OWNER_COLUMN (padrão: user_id)
 *
 * Sem essas variáveis o arquivo é marcado como "skipped" — registre como NÃO EXECUTADO.
 */
import { describe, expect, it } from "vitest";
import { checkDastTarget } from "../../scripts/lib/dast-guard.mjs";

const env = process.env;
const configured = Boolean(
  env.SUPABASE_TEST_URL &&
  env.SUPABASE_TEST_ANON_KEY &&
  env.SUPABASE_TEST_USER_A_EMAIL &&
  env.SUPABASE_TEST_USER_B_EMAIL &&
  env.SUPABASE_RLS_TABLE,
);

const table = env.SUPABASE_RLS_TABLE ?? "";
const ownerCol = env.SUPABASE_RLS_OWNER_COLUMN ?? "user_id";

async function rest(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", env.SUPABASE_TEST_ANON_KEY!);
  headers.set("Authorization", `Bearer ${init.token ?? env.SUPABASE_TEST_ANON_KEY}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${env.SUPABASE_TEST_URL}${path}`, { ...init, headers });
}

async function signIn(email: string, password: string) {
  const r = await rest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(r.status, `login de ${email}`).toBe(200);
  const body = await r.json();
  return { token: body.access_token as string, id: body.user.id as string };
}

describe.skipIf(!configured)("Supabase — autenticação, autorização e RLS", () => {
  it("alvo é local ou staging autorizado (nunca produção)", () => {
    const guard = checkDastTarget(env.SUPABASE_TEST_URL!);
    expect(guard.allowed, guard.reason).toBe(true);
  });

  it("login com senha errada é recusado", async () => {
    const r = await rest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: env.SUPABASE_TEST_USER_A_EMAIL, password: "senha-errada-123" }),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("anônimo não lê registros protegidos", async () => {
    const r = await rest(`/rest/v1/${table}?select=*`);
    const rows = r.ok ? await r.json() : [];
    expect(rows).toEqual([]);
  });

  it("usuário A não lê registros de B (BOLA/IDOR horizontal)", async () => {
    const a = await signIn(env.SUPABASE_TEST_USER_A_EMAIL!, env.SUPABASE_TEST_USER_A_PASSWORD!);
    const b = await signIn(env.SUPABASE_TEST_USER_B_EMAIL!, env.SUPABASE_TEST_USER_B_PASSWORD!);
    const r = await rest(`/rest/v1/${table}?select=*&${ownerCol}=eq.${b.id}`, { token: a.token });
    expect(r.ok ? await r.json() : []).toEqual([]);
  });

  it("usuário A não altera nem apaga registros de B", async () => {
    const a = await signIn(env.SUPABASE_TEST_USER_A_EMAIL!, env.SUPABASE_TEST_USER_A_PASSWORD!);
    const b = await signIn(env.SUPABASE_TEST_USER_B_EMAIL!, env.SUPABASE_TEST_USER_B_PASSWORD!);
    const headers = { Prefer: "return=representation" };
    const upd = await rest(`/rest/v1/${table}?${ownerCol}=eq.${b.id}`, {
      method: "PATCH",
      token: a.token,
      headers,
      body: JSON.stringify({ [ownerCol]: a.id }),
    });
    expect(upd.ok ? await upd.json() : []).toEqual([]);
    const del = await rest(`/rest/v1/${table}?${ownerCol}=eq.${b.id}`, {
      method: "DELETE",
      token: a.token,
      headers,
    });
    expect(del.ok ? await del.json() : []).toEqual([]);
  });

  it("usuário não insere registro em nome de outro", async () => {
    const a = await signIn(env.SUPABASE_TEST_USER_A_EMAIL!, env.SUPABASE_TEST_USER_A_PASSWORD!);
    const b = await signIn(env.SUPABASE_TEST_USER_B_EMAIL!, env.SUPABASE_TEST_USER_B_PASSWORD!);
    const r = await rest(`/rest/v1/${table}`, {
      method: "POST",
      token: a.token,
      body: JSON.stringify({ [ownerCol]: b.id }),
    });
    expect(r.ok).toBe(false);
  });

  it("token adulterado é recusado", async () => {
    const r = await rest(`/rest/v1/${table}?select=*`, {
      // Token propositalmente inválido, montado em tempo de execução para não parecer segredo.
      token: ["eyJhbGciOiJIUzI1NiJ9", "e30", "assinatura-invalida"].join("."),
    });
    expect(r.status).toBe(401);
  });
});
