# Template web do estúdio

Base Next.js 16 + React 19 + TypeScript estrito + Tailwind 4 com qualidade e segurança verificadas desde o primeiro commit. Cada cliente recebe sua própria identidade visual; o template entrega estrutura, acessibilidade, testes e gates.

## Começar

```bash
npm ci
npx playwright install chromium
npm run setup:githooks   # depois de git init
npm run dev
```

Projetos novos: `powershell -ExecutionPolicy Bypass -File ..\novo-projeto.ps1 -Slug nome-do-cliente` (cria em `clientes/`).

## Comandos

| Comando                      | O que faz                                                                                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`             | **Obrigatório antes de toda entrega.** Formatação, lint, tipos, unitários + cobertura, build, E2E (mobile/tablet/desktop, acessibilidade, visual, cabeçalhos), gate de segurança e DAST local. Gera relatório em `docs/security/reports/` |
| `npm run verify:quick`       | Formatação, lint, tipos e unitários (roda no `git push`)                                                                                                                                                                                  |
| `npm run security`           | npm audit, OSV-Scanner, Semgrep, gitleaks, checagens de Supabase                                                                                                                                                                          |
| `npm run dast`               | Teste dinâmico não destrutivo (local por padrão)                                                                                                                                                                                          |
| `npm run gate:selftest`      | Planta falhas controladas e prova que cada gate bloqueia                                                                                                                                                                                  |
| `npm run test:visual:update` | Regrava linhas de base visuais após mudança intencional                                                                                                                                                                                   |

## Estrutura

```
src/app/            páginas e Route Handlers (api/contact, api/health)
src/lib/            validação (zod), rate limit, utilitários HTTP
tests/unit/         Vitest — lógica, rotas, política de segurança
tests/e2e/          Playwright — fluxos, responsividade, a11y, visual, cabeçalhos
tests/supabase/     RLS/autorização (roda só com projeto Supabase de teste)
scripts/            verify, security-gate, dast, check-supabase, gate-selftest
.claude/            hooks do Claude Code (verificação por edição, typecheck no fim, guarda de comandos)
.githooks/          pre-commit (segredos, formatação, lint) e pre-push (verify:quick)
.github/workflows/  CI em PR, liberação com aprovação humana, varredura semanal
docs/security/      políticas, procedimentos, exceções, autorizações DAST, histórico
```

Detalhes de segurança: [docs/security/README.md](docs/security/README.md).
