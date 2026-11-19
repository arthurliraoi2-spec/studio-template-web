# Política de liberação — gates obrigatórios

Nenhuma entrega é publicada sem `npm run verify` com **STATUS FINAL: APROVADO**, localmente e no CI (`gate` em `.github/workflows/ci.yml`). Produção exige ainda a aprovação humana do ambiente `production` (`release.yml`).

## Critérios de bloqueio

| #   | Bloqueia quando                                                                                                | Onde é verificado                       |
| --- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Build falha                                                                                                    | `npm run build`                         |
| 2   | Formatação, lint (incl. regras de segurança) ou tipagem falham                                                 | `format:check`, `lint`, `typecheck`     |
| 3   | Qualquer teste obrigatório falha (unitário, integração, E2E, acessibilidade, responsividade, visual)           | `test:coverage`, `test:e2e`             |
| 4   | Cobertura abaixo de 80 % linhas/funções/instruções ou 70 % ramos na lógica de negócio e de política            | `vitest.config.mts`                     |
| 5   | Segredo real exposto no código ou no histórico git                                                             | gitleaks (`security`)                   |
| 6   | Vulnerabilidade **crítica ou alta** em dependência sem exceção vigente                                         | npm audit + OSV-Scanner (`security`)    |
| 7   | Achado SAST de severidade ERROR sem exceção vigente                                                            | Semgrep (`security`)                    |
| 8   | Tabela exposta sem RLS, `SECURITY DEFINER` sem `search_path`, chave privilegiada no cliente, `.env` versionado | `security:supabase`                     |
| 9   | Regressão em autenticação/autorização/RLS (quando o projeto usa Supabase)                                      | `tests/supabase/rls.test.ts`            |
| 10  | Falha no DAST local (cabeçalhos, exposição de arquivos, CORS, CSRF, validação, rate limit)                     | `npm run dast`, ZAP baseline no CI      |
| 11  | Uma verificação obrigatória **não foi executada** (ferramenta ausente, erro de execução, análise incompleta)   | todos — status PENDENTE também bloqueia |
| 12  | Exceção vencida ou mal preenchida em `exceptions.json`                                                         | `security`                              |

## O que não bloqueia, mas é registrado

- Vulnerabilidades **médias e baixas** e achados SAST WARNING/INFO: aparecem no relatório, são priorizados no backlog e tratados conforme prazo abaixo.
- RLS habilitado sem policies (nega tudo): aviso médio.

| Severidade | Prazo de tratamento                                                 |
| ---------- | ------------------------------------------------------------------- |
| Crítica    | Bloqueia; corrigir antes da entrega                                 |
| Alta       | Bloqueia; corrigir antes da entrega ou exceção formal com mitigação |
| Média      | Até 30 dias                                                         |
| Baixa      | Até 90 dias ou próxima atualização planejada                        |

## Status

- **APROVADO** — todos os gates obrigatórios executaram e passaram.
- **BLOQUEADO** — existe falha impeditiva.
- **PENDENTE** — falta evidência (verificação não executada). Também impede a publicação.

Alertas de ferramenta não são automaticamente vulnerabilidades exploráveis: investigar aplicabilidade antes de corrigir ou excepcionar, e documentar falsos positivos (ver `procedimentos.md`).
