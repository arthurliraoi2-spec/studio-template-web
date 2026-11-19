import { describe, expect, it } from "vitest";
import {
  analyzeMigrations,
  findClientSecretUsage,
  findTrackedEnvFiles,
} from "../../scripts/lib/supabase-checks.mjs";

const rules = (sql: string) => analyzeMigrations([{ path: "m.sql", sql }]).map((i) => i.rule);

describe("analyzeMigrations", () => {
  it("tabela pública sem RLS bloqueia", () => {
    expect(rules("create table public.notes (id uuid primary key);")).toContain("rls-missing");
    expect(rules("create table notes (id int);")).toContain("rls-missing");
  });

  it("tabela com RLS e policy passa", () => {
    const sql = `
      create table if not exists public.notes (id uuid, owner uuid);
      alter table public.notes enable row level security;
      create policy "dono lê" on public.notes for select using (auth.uid() = owner);`;
    expect(rules(sql)).toEqual([]);
  });

  it("RLS sem policy gera aviso médio", () => {
    const issues = analyzeMigrations([
      {
        path: "m.sql",
        sql: "create table public.t (id int); alter table public.t enable row level security;",
      },
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ rule: "rls-no-policy", severity: "medium" }),
    ]);
  });

  it("schemas privados não exigem RLS", () => {
    expect(rules("create table private.audit (id int);")).toEqual([]);
  });

  it("ignora comentários", () => {
    expect(
      rules("-- create table public.x (id int);\n/* create table public.y (id int); */"),
    ).toEqual([]);
  });

  it("detecta disable RLS, SECURITY DEFINER sem search_path e grant amplo para anon", () => {
    const sql = `
      create table public.t (id int);
      alter table public.t enable row level security;
      create policy p on public.t using (true);
      alter table public.t disable row level security;
      create or replace function public.f() returns void language plpgsql security definer as $$ begin end $$;
      grant all on all tables in schema public to anon;`;
    expect(rules(sql)).toEqual(
      expect.arrayContaining(["rls-disabled", "security-definer-search-path", "grant-all-anon"]),
    );
  });

  it("SECURITY DEFINER com search_path fixo passa", () => {
    const sql =
      "create function public.f() returns void language sql security definer set search_path = '' as $$ select 1 $$;";
    expect(rules(sql)).not.toContain("security-definer-search-path");
  });
});

describe("findClientSecretUsage", () => {
  it("service_role em componente cliente bloqueia; no servidor não", () => {
    const src = "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;";
    expect(
      findClientSecretUsage([{ path: "src/app/x.tsx", source: `"use client";\n${src}` }]),
    ).toHaveLength(1);
    expect(findClientSecretUsage([{ path: "src/lib/admin.ts", source: src }])).toHaveLength(0);
  });

  it("NEXT_PUBLIC_ com nome de segredo bloqueia em qualquer arquivo", () => {
    const r = findClientSecretUsage([
      { path: "src/lib/a.ts", source: "process.env.NEXT_PUBLIC_STRIPE_SECRET" },
    ]);
    expect(r[0].rule).toBe("public-env-secret");
  });
});

describe("findTrackedEnvFiles", () => {
  it("bloqueia .env versionado e permite .env.example", () => {
    const r = findTrackedEnvFiles([".env", "apps/web/.env.local", ".env.example", "src/env.ts"]);
    expect(r.map((i) => i.path)).toEqual([".env", "apps/web/.env.local"]);
  });
});
