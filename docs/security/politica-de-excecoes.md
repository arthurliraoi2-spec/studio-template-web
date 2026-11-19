# Política de exceções

Uma exceção aceita formalmente um risco que, de outra forma, bloquearia a entrega. Ela é temporária, justificada, aprovada por uma pessoa responsável e lida automaticamente pelo gate.

## Quando é aceitável

- Falso positivo confirmado (o código vulnerável não é alcançável, o padrão não se aplica).
- Vulnerabilidade sem correção publicada, com mitigação compensatória em vigor.
- Correção exige mudança maior já planejada, com mitigação até lá.

Nunca é aceitável para: segredo real exposto (revogue e rotacione), tabela sem RLS em produção, autorização ausente no servidor.

## Como registrar

Adicione em [exceptions.json](exceptions.json):

```json
{
  "id": "GHSA-xxxx-xxxx-xxxx",
  "tool": "npm-audit",
  "reason": "Função vulnerável (parseX) não é importada pelo projeto; verificado em src/ e no bundle.",
  "mitigation": "Entrada já validada por zod antes de chegar à biblioteca.",
  "approvedBy": "Nome do responsável técnico",
  "expires": "2026-12-31"
}
```

| Campo     | Regra                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `tool`    | `npm-audit`, `osv-scanner` ou `semgrep`                                                                 |
| `id`      | GHSA/CVE/OSV id; para Semgrep, `check_id` (todas as ocorrências) ou `check_id:caminho` (uma ocorrência) |
| `expires` | Máximo 90 dias. Vencida, a exceção deixa de valer **e** bloqueia o gate até ser renovada ou removida    |

Falsos positivos de **segredos** não usam este arquivo: adicione o fingerprint do gitleaks em `.gitleaksignore` com um comentário explicando o motivo. Para Semgrep, prefira `// nosemgrep: <regra> — motivo` na linha, quando o motivo for local.

## Revisão

Toda exceção nova ou renovada entra no PR com o motivo visível no diff e é revisada por outra pessoa. Exceções são reavaliadas no vencimento e na verificação semanal.
