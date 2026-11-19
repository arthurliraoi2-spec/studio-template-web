# Segurança do projeto

Esta pasta é a fonte única de verdade sobre a segurança do projeto: como verificamos, o que bloqueia uma entrega, quais exceções foram aceitas e o histórico das auditorias.

| Arquivo                                              | Conteúdo                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| [procedimentos.md](procedimentos.md)                 | Como rodar cada verificação, ferramentas, o que fazer com cada tipo de achado |
| [politica-de-liberacao.md](politica-de-liberacao.md) | Critérios de bloqueio (gates) e status APROVADO / BLOQUEADO / PENDENTE        |
| [politica-de-excecoes.md](politica-de-excecoes.md)   | Como aceitar formalmente um risco, com prazo e aprovação                      |
| [exceptions.json](exceptions.json)                   | Exceções vigentes, lidas automaticamente pelo gate                            |
| [dast-autorizacoes.md](dast-autorizacoes.md)         | Registro de alvos autorizados para testes dinâmicos (staging)                 |
| [modelo-de-ameacas.md](modelo-de-ameacas.md)         | Superfície de ataque e controles do projeto (preencher por cliente)           |
| [historico-auditorias.md](historico-auditorias.md)   | Uma linha por execução de gate, gerada automaticamente                        |
| `reports/`                                           | Relatórios completos (Markdown + JSON) de cada execução                       |

## Comandos

```bash
npm run verify          # pipeline completo — obrigatório antes de toda entrega
npm run verify:quick    # checagens rápidas durante o desenvolvimento
npm run security        # só o gate de segurança
npm run dast            # DAST contra servidor local (ou staging autorizado)
npm run gate:selftest   # prova que os gates bloqueiam falhas controladas
```
