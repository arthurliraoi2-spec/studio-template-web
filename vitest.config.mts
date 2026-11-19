import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,mts}", "tests/supabase/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Lógica de negócio e de política de segurança. Scripts de orquestração (CLI, servidor,
      // relatórios) são exercitados pelo gate:selftest e pelo pipeline, não por unitários.
      include: [
        "src/lib/**",
        "src/app/api/**",
        "scripts/lib/policy.mjs",
        "scripts/lib/supabase-checks.mjs",
        "scripts/lib/dast-guard.mjs",
      ],
      reporter: ["text-summary", "json-summary"],
      // Gate de cobertura: falha o comando se cair abaixo destes valores.
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
