# Autorizações para testes dinâmicos (DAST)

Testes dinâmicos só rodam em:

1. **Ambiente local** (`localhost`, `127.0.0.1`, `::1`, `*.localhost`, `*.test`) e no próprio runner de CI — sempre permitido.
2. **Staging** expressamente autorizado e registrado abaixo.

**Produção nunca é alvo.** O script recusa hosts sem rótulo de ambiente de teste (`staging`, `stage`, `dev`, `test`, `qa`, `sandbox`, `preview`) mesmo que listados.

## Como autorizar um staging

1. O proprietário do projeto aprova por escrito (e-mail/issue). Registre abaixo.
2. Execute com as três travas:

```bash
DAST_TARGET=https://staging.cliente.com.br DAST_ALLOWED_HOSTS=staging.cliente.com.br DAST_AUTHORIZED=yes npm run dast
```

3. O relatório vai para `reports/` e uma linha para `historico-auditorias.md`.

O DAST do projeto é não destrutivo: poucas requisições (≈ 40), sem fuzzing massivo, sem tentativa de exploração, sem carga. Ferramentas de varredura ativa (ZAP full scan, etc.) exigem autorização específica e janela combinada.

## Registro

| Data | Host | Autorizado por | Escopo / janela | Validade |
| ---- | ---- | -------------- | --------------- | -------- |
| —    | —    | —              | —               | —        |
