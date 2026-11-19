# Procedimentos de qualidade e segurança

## Fluxo obrigatório

| Momento                                            | O que roda                                                         | Como                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| A cada edição do Claude Code                       | Prettier + ESLint no arquivo editado, varredura rápida de segredos | Hook `PostToolUse` (`.claude/hooks/post-edit.mjs`)     |
| Ao final de cada resposta do Claude Code           | Typecheck, só se houve mudança em TS desde a última checagem       | Hook `Stop` (`.claude/hooks/stop-typecheck.mjs`)       |
| Antes de comandos de deploy/publicação/destrutivos | Pede confirmação explícita                                         | Hook `PreToolUse` (`.claude/hooks/pre-bash-guard.mjs`) |
| `git commit`                                       | Segredos nos arquivos staged + formatação + lint                   | `.githooks/pre-commit` (`npm run setup:githooks`)      |
| `git push`                                         | `verify:quick`                                                     | `.githooks/pre-push`                                   |
| Pull request / push em `main`                      | Pipeline completo + autoteste dos gates + ZAP baseline             | `.github/workflows/ci.yml`                             |
| Toda entrega                                       | `npm run verify` com STATUS FINAL APROVADO                         | Local e CI                                             |
| Semanal                                            | Pipeline completo (novas CVEs) + Dependabot                        | `security-scheduled.yml`, `dependabot.yml`             |

## Ferramentas

| Ferramenta                      | Função                                                                                 | Instalação local (Windows)                                         | CI                            |
| ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| ESLint + eslint-plugin-security | Lint e padrões inseguros em JS/TS                                                      | `npm ci`                                                           | idem                          |
| Prettier                        | Formatação                                                                             | `npm ci`                                                           | idem                          |
| TypeScript                      | Tipagem estrita                                                                        | `npm ci`                                                           | idem                          |
| Vitest                          | Unitários, integração de rotas, RLS                                                    | `npm ci`                                                           | idem                          |
| Playwright + axe-core           | E2E, responsividade, acessibilidade WCAG 2.2, regressão visual                         | `npm ci && npx playwright install chromium`                        | idem                          |
| npm audit                       | Vulnerabilidades em dependências                                                       | incluso no npm                                                     | idem                          |
| OSV-Scanner                     | Vulnerabilidades (base OSV.dev)                                                        | `winget install Google.OSVScanner`                                 | binário fixo                  |
| Semgrep                         | SAST (OWASP Top 10, TS/JS, React, Next.js + regras do estúdio em `.semgrep/rules.yml`) | `winget install Python.Python.3.12` e `pip install --user semgrep` | `pip install semgrep==versão` |
| gitleaks                        | Segredos no diretório e no histórico git                                               | `winget install Gitleaks.Gitleaks`                                 | binário fixo                  |
| OWASP ZAP baseline              | DAST passivo                                                                           | Docker (opcional local)                                            | `zaproxy/action-baseline`     |

Ferramenta ausente → a verificação fica **NÃO EXECUTADO** e o gate falha (status PENDENTE). `npm run security -- --allow-missing` só existe para uso local rápido e é ignorado em CI. Se uma ferramenta estiver em local não padrão, defina `GITLEAKS_BIN`, `OSV_SCANNER_BIN` ou `SEMGREP_BIN`.

## Tratando achados

1. **Leia o relatório** em `reports/` (Markdown) — cada achado tem ferramenta, severidade, id e local.
2. **Investigue a aplicabilidade.** O código vulnerável é alcançável? A entrada é controlada por usuário?
3. **Corrija** quando aplicável: atualize a dependência (`npm audit fix`, Dependabot), ajuste o código.
4. **Falso positivo ou risco aceito** → siga [politica-de-excecoes.md](politica-de-excecoes.md).
5. **Segredo exposto** → considere-o comprometido: revogue e rotacione no provedor, depois remova do código e, se necessário, do histórico. Remover o arquivo não basta.
6. Rode novamente o gate afetado e o `verify`.

## Supabase

Quando o projeto usar Supabase:

- Migrações em `supabase/migrations/*.sql` são verificadas a cada `security` (RLS em toda tabela de `public`, policies presentes, `SECURITY DEFINER` com `set search_path`, sem `GRANT ALL` para `anon`).
- `tests/supabase/rls.test.ts` testa login inválido, leitura anônima, acesso horizontal entre usuários (ler/alterar/apagar/inserir em nome de outro) e token adulterado. Configure as variáveis `SUPABASE_TEST_*` de `.env.example` apontando para `supabase start` (local, requer Docker) ou staging autorizado, com **usuários de teste** — nunca produção nem dados reais.
- Sem essas variáveis os testes ficam _skipped_: registre como **NÃO EXECUTADO** no relatório da entrega.
- A chave `service_role` só existe no servidor. Edge Functions verificam o JWT e a autorização de cada operação.

## Regressão visual

As linhas de base ficam em `tests/e2e/__screenshots__/<plataforma>/<viewport>/`. Após uma mudança visual **intencional**, rode `npm run test:visual:update`, revise as imagens e versione-as. No CI (Linux), enquanto a pasta `linux/` não existir, as imagens são geradas e publicadas como artefato `playwright-report` — baixe, revise e versione para ativar a comparação no CI.

## CSP

O template usa CSP sem nonce (`'unsafe-inline'` em script/style) para manter páginas estáticas. Se o projeto renderizar HTML de usuários ou incluir scripts de terceiros, migre para nonce via `proxy.ts` ou SRI — guia em `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.

## Rate limit

`src/lib/rate-limit.ts` guarda contadores em memória. Em hospedagem serverless ou com várias instâncias, troque por armazenamento compartilhado mantendo a mesma interface, e confirme qual cabeçalho de IP o provedor garante.
