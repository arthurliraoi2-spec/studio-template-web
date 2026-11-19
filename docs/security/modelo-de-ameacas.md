# Modelo de ameaças — preencher por projeto

Atualize ao criar o projeto e a cada mudança relevante de superfície (novo endpoint, login, upload, integração).

## Ativos e dados

| Dado                               | Classificação (público / interno / pessoal / sensível) | Onde fica                        | Quem acessa       |
| ---------------------------------- | ------------------------------------------------------ | -------------------------------- | ----------------- |
| Mensagens do formulário de contato | Pessoal (nome, e-mail)                                 | Integração definida pelo projeto | Equipe do cliente |

## Superfície de ataque

| Entrada             | Autenticação | Controles                                                                                                              | Testes                                        |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `POST /api/contact` | Pública      | zod estrito, limite de 8 KB, JSON obrigatório, checagem de Origin (CSRF), rate limit, honeypot, log sem dados pessoais | `tests/unit/contact-route.test.ts`, E2E, DAST |
| `GET /api/health`   | Pública      | Sem dados, `no-store`                                                                                                  | unitário, E2E                                 |
| Páginas             | Pública      | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy                                               | E2E `security-headers`, DAST, ZAP             |

## Riscos conhecidos do template

| Risco                                      | Situação                                             | Ação no projeto                                                                     |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CSP com `'unsafe-inline'` (sem nonce)      | Aceito no template para manter renderização estática | Migrar para nonce (proxy.ts) ou SRI se houver conteúdo de terceiros/usuário         |
| Rate limit em memória                      | Não compartilhado entre instâncias                   | Trocar por armazenamento compartilhado antes de produção serverless/multi-instância |
| `x-forwarded-for` confiado para rate limit | Correto só atrás de proxy conhecido                  | Confirmar cabeçalho real do provedor de hospedagem                                  |
