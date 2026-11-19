import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  security.configs.recommended,
  {
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "react/no-danger": "error",
      // Gera muitos falsos positivos em acesso a objetos tipados; Semgrep cobre os casos reais.
      "security/detect-object-injection": "off",
    },
  },
  {
    files: ["scripts/**", "tests/**", ".claude/hooks/**", "*.config.*"],
    rules: {
      // Scripts de tooling leem caminhos controlados pelo próprio projeto.
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-child-process": "off",
      "security/detect-non-literal-regexp": "off",
      // Regexes aplicadas apenas a arquivos locais do projeto (migrações), não a entrada externa.
      "security/detect-unsafe-regex": "off",
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
